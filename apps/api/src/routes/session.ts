import type { FastifyInstance } from "fastify";
import type { ApiDependencies } from "../dependencies.js";
import {
  clearSessionCookie,
  readSessionToken,
  requireSession,
  sessionOf,
  setSessionCookie,
} from "../auth/session.js";

const OWNER_HINT = /^[\x20-\x7e]{1,64}$/u;
const PARTY = /^[^\s:]{1,128}::1220[0-9a-f]{64}$/u;
const WALLET_ID = /^[0-9a-f]{32}$/u;
const SIGNER_TIMEOUT_MS = 300_000;

function body(request: { body: unknown }): Record<string, unknown> {
  const value = request.body;
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Owner-session establishment (S29): the hosted path onboards a real
 * signer-held wallet on Five North and binds the session to the created
 * party; the external path proves party control with a one-use Ed25519
 * challenge signature. There is no email, no OTP, and no simulated
 * onboarding — signer and DevNet failures pass through as themselves.
 */
export function registerSessionRoutes(
  server: FastifyInstance,
  deps: ApiDependencies,
): void {
  const secure = deps.publicAppOrigin.startsWith("https:");

  server.post("/v1/onboarding/hosted", async (request, reply) => {
    const ownerHint = body(request).ownerHint;
    if (typeof ownerHint !== "string" || !OWNER_HINT.test(ownerHint)) {
      return reply.status(400).send({
        error: "owner-hint-invalid",
        detail:
          "Provide a printable owner hint up to 64 characters to name the " +
          "hosted wallet.",
      });
    }
    const signal = AbortSignal.timeout(SIGNER_TIMEOUT_MS);
    const created = await deps.signer.createWallet(ownerHint, { signal });
    if (created.status !== 201) {
      // Honest pass-through: the signer's 503 five-north-unavailable or
      // 502 onboarding failure is the caller's truth, not this API's.
      return reply.status(created.status).send(created.body);
    }
    const { partyId, walletId, fingerprint } = created.body;
    if (typeof partyId !== "string" || typeof walletId !== "string") {
      return reply.status(502).send({
        error: "signer-response-invalid",
        detail:
          "The signer created a wallet but answered without a party. " +
          "Inspect the signer service before retrying.",
      });
    }
    const session = await deps.sessions.createSession({ partyId });
    setSessionCookie(reply, session.token, secure);
    const linked = await deps.signer.linkWallet(walletId, { signal });
    return reply.status(201).send({
      partyId,
      walletId,
      fingerprint: typeof fingerprint === "string" ? fingerprint : null,
      walletUrl:
        linked.status === 201 && typeof linked.body.linkUrl === "string"
          ? linked.body.linkUrl
          : null,
      session: { expiresAt: session.session.expiresAt },
    });
  });

  server.post(
    "/v1/onboarding/hosted/:walletId/fund",
    { preHandler: requireSession(deps.sessions) },
    async (request, reply) => {
      const { walletId } = request.params as Readonly<{ walletId: string }>;
      if (!WALLET_ID.test(walletId)) {
        return reply
          .status(400)
          .send({ error: "wallet-id-invalid", detail: "Unknown wallet ID." });
      }
      const session = sessionOf(request);
      const signal = AbortSignal.timeout(SIGNER_TIMEOUT_MS);
      const profile = await deps.signer.readWalletProfile(walletId, { signal });
      if (profile.status !== 200 || profile.body.partyId !== session.partyId) {
        return reply.status(404).send({
          error: "wallet-unknown",
          detail:
            "No hosted wallet with this ID belongs to your owner session.",
        });
      }
      const funded = await deps.signer.fundWallet(walletId, { signal });
      // The tap result is returned exactly as the signer reported it: a
      // real {updateId} from Five North, {alreadyFunded} from the durable
      // tap journal, or the upstream failure.
      return reply.status(funded.status).send(funded.body);
    },
  );

  server.post("/v1/session/challenge", async (request, reply) => {
    const partyId = body(request).partyId;
    if (typeof partyId !== "string" || !PARTY.test(partyId)) {
      return reply.status(400).send({
        error: "party-id-invalid",
        detail:
          "Provide the canonical Canton party ID (hint::1220…) to receive " +
          "a session challenge.",
      });
    }
    const challenge = deps.challenges.issue(partyId);
    return reply.status(201).send({
      challenge,
      instruction:
        "Sign the exact JSON serialization of `challenge` with the party's " +
        "Ed25519 signing key. This signature does not move funds.",
    });
  });

  server.post("/v1/session/verify", async (request, reply) => {
    const payload = body(request);
    const { challengeId, signature, publicKeyBase64, fingerprint } = payload;
    if (
      typeof challengeId !== "string" ||
      typeof signature !== "string" ||
      typeof publicKeyBase64 !== "string" ||
      typeof fingerprint !== "string"
    ) {
      return reply.status(400).send({
        error: "verification-fields-missing",
        detail:
          "Provide challengeId, signature, publicKeyBase64, and " +
          "fingerprint from the wallet.",
      });
    }
    const verification = deps.challenges.verify({
      challengeId,
      signatureBase64: signature,
      publicKeyBase64,
      fingerprint,
    });
    if (verification.outcome !== "verified") {
      return reply.status(401).send({
        error: "party-proof-rejected",
        reason: verification.reason,
        detail:
          "The party-control proof did not verify. Request a fresh " +
          "challenge and sign it with the party's registered key.",
      });
    }
    const session = await deps.sessions.createSession({
      partyId: verification.partyId,
    });
    setSessionCookie(reply, session.token, secure);
    return reply.status(201).send({
      partyId: verification.partyId,
      session: { expiresAt: session.session.expiresAt },
      proof: {
        proven: [
          "ed25519-signature-over-one-use-challenge",
          "fingerprint-derived-from-public-key",
          "party-namespace-matches-fingerprint",
        ],
        deferred: ["live-topology-authorization-of-this-key-for-the-party"],
      },
    });
  });

  server.delete("/v1/session", async (request, reply) => {
    const token = readSessionToken(request);
    if (token !== undefined) await deps.sessions.revokeByToken(token);
    clearSessionCookie(reply);
    return reply.status(204).send();
  });
}
