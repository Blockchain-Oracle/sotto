import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { CatalogRepository } from "@sotto/database";

const WELL_KNOWN_PATH = "/.well-known/sotto-origin-proof";
const CHALLENGE_TTL_MS = 15 * 60 * 1_000;
const PROOF_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 4_096;
const MAX_PENDING = 1_024;

type PendingProofChallenge = Readonly<{
  originId: string;
  ownerId: string;
  token: string;
  expiresAt: number;
}>;

export type ProofOutcome = Readonly<{
  status: number;
  body: Readonly<Record<string, unknown>>;
}>;

export type WellKnownFetcher = (
  url: string,
  signal: AbortSignal,
) => Promise<Response>;

export type OriginProofService = Readonly<{
  issueChallenge(
    input: Readonly<{ originId: string; ownerId: string }>,
  ): Promise<ProofOutcome>;
  verifyChallenge(
    input: Readonly<{
      originId: string;
      ownerId: string;
      signal: AbortSignal;
    }>,
  ): Promise<ProofOutcome>;
}>;

function sha256(value: string | Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function fail(status: number, error: string, detail: string): ProofOutcome {
  return Object.freeze({ status, body: Object.freeze({ error, detail }) });
}

async function readBoundedBody(response: Response): Promise<Buffer | null> {
  const reader = response.body?.getReader();
  if (reader === undefined) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Well-known origin-ownership proof, end to end real: Sotto issues a
 * one-use token bound to the origin and owner, the provider serves it at
 * `/.well-known/sotto-origin-proof`, and this process fetches it over
 * public HTTPS before recording the proof row the publication gate
 * requires. DNS-record proofs have no verification path here yet and are
 * answered 501, never silently passed.
 */
export function createOriginProofService(
  pool: Pool,
  repository: CatalogRepository,
  fetcher?: WellKnownFetcher,
): OriginProofService {
  const pending = new Map<string, PendingProofChallenge>();
  const fetchWellKnown: WellKnownFetcher =
    fetcher ??
    (async (url, signal) =>
      fetch(url, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(FETCH_TIMEOUT_MS),
        ]),
      }));

  async function requireOwnedOrigin(originId: string, ownerId: string) {
    const origin = await repository.findProviderOriginById(originId);
    if (origin === null || origin.ownerId !== ownerId) return null;
    return origin;
  }

  return Object.freeze({
    issueChallenge: async ({ originId, ownerId }) => {
      const origin = await requireOwnedOrigin(originId, ownerId);
      if (origin === null) {
        return fail(
          404,
          "origin-unknown",
          "This origin is not registered to your owner session. Register " +
            "the origin first.",
        );
      }
      while (pending.size >= MAX_PENDING) {
        const oldest = pending.keys().next().value;
        if (oldest === undefined) break;
        pending.delete(oldest);
      }
      const token = randomBytes(32).toString("hex");
      pending.set(originId, {
        originId,
        ownerId,
        token,
        expiresAt: Date.now() + CHALLENGE_TTL_MS,
      });
      return Object.freeze({
        status: 201,
        body: Object.freeze({
          method: "well-known",
          token,
          wellKnownUrl: `${origin.normalizedOrigin}${WELL_KNOWN_PATH}`,
          expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
        }),
      });
    },
    verifyChallenge: async ({ originId, ownerId, signal }) => {
      const origin = await requireOwnedOrigin(originId, ownerId);
      if (origin === null) {
        return fail(
          404,
          "origin-unknown",
          "This origin is not registered to your owner session.",
        );
      }
      const challenge = pending.get(originId);
      if (
        challenge === undefined ||
        challenge.ownerId !== ownerId ||
        challenge.expiresAt <= Date.now()
      ) {
        pending.delete(originId);
        return fail(
          409,
          "proof-challenge-missing",
          "No live proof challenge exists for this origin. Issue a new " +
            "challenge, publish the token, then verify.",
        );
      }
      const url = `${origin.normalizedOrigin}${WELL_KNOWN_PATH}`;
      let body: Buffer | null;
      try {
        const response = await fetchWellKnown(url, signal);
        body = response.status === 200 ? await readBoundedBody(response) : null;
      } catch {
        body = null;
      }
      const served = body?.toString("utf8").trim();
      if (served !== challenge.token) {
        return fail(
          422,
          "proof-not-served",
          "The origin did not serve the issued token at " +
            `${WELL_KNOWN_PATH}. Publish the exact token, then verify again.`,
        );
      }
      pending.delete(originId);
      const revisionRow = await pool.query<{ next: string }>(
        `SELECT (coalesce(max(proof_revision), 0) + 1)::text AS next
         FROM sotto.origin_proofs WHERE origin_id = $1`,
        [originId],
      );
      const verifiedAt = new Date();
      const proofId = randomUUID();
      const record = await repository.recordOriginProof({
        proofId,
        ownerId,
        originId,
        proofRevision: Number(revisionRow.rows[0]?.next ?? "1"),
        challengeHash: sha256(challenge.token),
        evidenceHash: sha256(body ?? Buffer.alloc(0)),
        verifiedAt: verifiedAt.toISOString(),
        expiresAt: new Date(verifiedAt.getTime() + PROOF_TTL_MS).toISOString(),
      });
      return Object.freeze({
        status: 201,
        body: Object.freeze({
          proofId: record.id,
          outcome: record.outcome,
          verifiedAt: verifiedAt.toISOString(),
          expiresAt: new Date(
            verifiedAt.getTime() + PROOF_TTL_MS,
          ).toISOString(),
        }),
      });
    },
  });
}
