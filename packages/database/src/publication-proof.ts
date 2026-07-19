import type { Pool, PoolClient } from "pg";
import { CatalogConflictError } from "./catalog-types.js";
import {
  validateOriginProof,
  type ValidatedOriginProof,
} from "./publication-proof-validation.js";
import {
  PublicationIneligibleError,
  type OriginProofInput,
  type PublicationRecordResult,
} from "./publication-types.js";
import {
  lockPublicationIdentity,
  publicationTransaction,
} from "./publication-transaction.js";

async function existingProof(
  client: PoolClient,
  proofId: string,
): Promise<string | undefined> {
  const result = await client.query<{ requestHash: string }>(
    `SELECT request_hash AS "requestHash"
     FROM sotto.origin_proofs WHERE proof_id = $1`,
    [proofId],
  );
  return result.rows[0]?.requestHash;
}

async function requireOwnedOrigin(
  client: PoolClient,
  proof: ValidatedOriginProof,
): Promise<void> {
  const result = await client.query(
    `SELECT 1
     FROM sotto.origins AS origin
     JOIN sotto.providers AS provider ON provider.id = origin.provider_id
     WHERE origin.id = $1 AND provider.owner_id = $2`,
    [proof.originId, proof.ownerId],
  );
  if (result.rowCount !== 1) throw new PublicationIneligibleError();
}

export async function recordOriginProof(
  pool: Pool,
  candidate: OriginProofInput,
): Promise<PublicationRecordResult> {
  const proof = validateOriginProof(candidate);
  return publicationTransaction(pool, async (client) => {
    await lockPublicationIdentity(client, "origin", proof.originId);
    await lockPublicationIdentity(client, "proof", proof.proofId);
    const existing = await existingProof(client, proof.proofId);
    if (existing !== undefined) {
      if (existing !== proof.requestHash) throw new CatalogConflictError();
      return Object.freeze({ id: proof.proofId, outcome: "replayed" });
    }
    await requireOwnedOrigin(client, proof);
    await client.query(
      `INSERT INTO sotto.origin_proofs
        (proof_id, request_hash, origin_id, proof_revision, challenge_hash,
         evidence_hash, verified_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        proof.proofId,
        proof.requestHash,
        proof.originId,
        proof.proofRevision,
        proof.challengeHash,
        proof.evidenceHash,
        proof.verifiedAt,
        proof.expiresAt,
      ],
    );
    return Object.freeze({ id: proof.proofId, outcome: "created" });
  });
}
