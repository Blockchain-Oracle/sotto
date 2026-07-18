import type { Pool, PoolClient } from "pg";
import { CatalogConflictError } from "./catalog-types.js";
import { publicResourceByPublication } from "./publication-public-query.js";
import {
  validatePublicationRequest,
  type ValidatedPublicationRequest,
} from "./publication-request-validation.js";
import {
  PublicationIneligibleError,
  PublicationStaleError,
  type PublicationOperationResult,
  type PublishVerifiedResourceInput,
} from "./publication-types.js";
import {
  lockPublicationIdentity,
  publicationTransaction,
} from "./publication-transaction.js";

type ListingRow = Readonly<{ listingId: string; version: string }>;
async function existingOperation(
  client: PoolClient,
  publicationId: string,
): Promise<string | undefined> {
  const result = await client.query<{ requestHash: string }>(
    `SELECT request_hash AS "requestHash"
     FROM sotto.publication_operations WHERE publication_id = $1`,
    [publicationId],
  );
  return result.rows[0]?.requestHash;
}

async function requireOwnedResource(
  client: PoolClient,
  request: ValidatedPublicationRequest,
): Promise<string> {
  const result = await client.query<{ originId: string }>(
    `SELECT resource.origin_id AS "originId"
     FROM sotto.resources AS resource
     JOIN sotto.origins AS origin ON origin.id = resource.origin_id
     JOIN sotto.providers AS provider ON provider.id = origin.provider_id
     WHERE resource.id = $1 AND provider.owner_id = $2`,
    [request.resourceId, request.ownerId],
  );
  const originId = result.rows[0]?.originId;
  if (originId === undefined) throw new PublicationIneligibleError();
  return originId;
}

async function requireCurrentProof(
  client: PoolClient,
  request: ValidatedPublicationRequest,
  originId: string,
): Promise<void> {
  const result = await client.query(
    `SELECT 1
     FROM sotto.origin_proofs AS proof
     WHERE proof.proof_id = $1
       AND proof.origin_id = $2
       AND proof.verified_at <= clock_timestamp()
       AND proof.expires_at > clock_timestamp()
       AND proof.proof_revision = (
         SELECT max(current.proof_revision)
         FROM sotto.origin_proofs AS current
         WHERE current.origin_id = proof.origin_id
       )`,
    [request.originProofId, originId],
  );
  if (result.rowCount !== 1) throw new PublicationIneligibleError();
}

async function requireLatestRevision(
  client: PoolClient,
  request: ValidatedPublicationRequest,
  originId: string,
): Promise<void> {
  const result = await client.query<{ target: string; latest: string }>(
    `SELECT revision.revision_number::text AS target,
            latest.revision_number::text AS latest
     FROM sotto.resource_revisions AS revision
     JOIN LATERAL (
       SELECT max(candidate.revision_number) AS revision_number
       FROM sotto.resource_revisions AS candidate
       WHERE candidate.resource_id = revision.resource_id
     ) AS latest ON true
     WHERE revision.revision_id = $1
       AND revision.resource_id = $2
       AND revision.origin_id = $3`,
    [request.resourceRevisionId, request.resourceId, originId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new PublicationIneligibleError();
  if (row.target !== row.latest) throw new PublicationStaleError();
}

async function currentListing(
  client: PoolClient,
  resourceId: string,
): Promise<ListingRow | undefined> {
  const result = await client.query<ListingRow>(
    `SELECT listing_id AS "listingId", version::text AS version
     FROM sotto.listings WHERE resource_id = $1 FOR UPDATE`,
    [resourceId],
  );
  return result.rows[0];
}

function nextListingVersion(
  row: ListingRow | undefined,
  request: ValidatedPublicationRequest,
): bigint {
  if (row === undefined) {
    if (request.expectedListingVersion !== 0) throw new PublicationStaleError();
    return 1n;
  }
  if (row.listingId !== request.listingId) throw new CatalogConflictError();
  const current = BigInt(row.version);
  if (current !== BigInt(request.expectedListingVersion)) {
    throw new PublicationStaleError();
  }
  return current + 1n;
}

async function persistPublication(
  client: PoolClient,
  request: ValidatedPublicationRequest,
  originId: string,
  listingVersion: bigint,
): Promise<void> {
  await client.query(
    `INSERT INTO sotto.listings
      (listing_id, resource_id, origin_id, published_revision_id, proof_id,
       state, version, published_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'published', $6,
             clock_timestamp(), clock_timestamp())
     ON CONFLICT (resource_id) DO UPDATE SET
       published_revision_id = EXCLUDED.published_revision_id,
       proof_id = EXCLUDED.proof_id,
       state = 'published',
       version = EXCLUDED.version,
       updated_at = clock_timestamp()`,
    [
      request.listingId,
      request.resourceId,
      originId,
      request.resourceRevisionId,
      request.originProofId,
      listingVersion.toString(),
    ],
  );
  await client.query(
    `INSERT INTO sotto.publication_operations
      (publication_id, request_hash, listing_id, resource_id, origin_id,
       revision_id, proof_id, owner_id, listing_version, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp())`,
    [
      request.publicationId,
      request.requestHash,
      request.listingId,
      request.resourceId,
      originId,
      request.resourceRevisionId,
      request.originProofId,
      request.ownerId,
      listingVersion.toString(),
    ],
  );
}

export async function publishVerifiedResource(
  pool: Pool,
  candidate: PublishVerifiedResourceInput,
): Promise<PublicationOperationResult> {
  const request = validatePublicationRequest(candidate);
  return publicationTransaction(pool, async (client) => {
    await lockPublicationIdentity(client, "publication", request.publicationId);
    const existing = await existingOperation(client, request.publicationId);
    if (existing !== undefined) {
      if (existing !== request.requestHash) throw new CatalogConflictError();
      return Object.freeze({
        ...(await publicResourceByPublication(client, request.publicationId)),
        outcome: "replayed" as const,
      });
    }
    await lockPublicationIdentity(client, "resource", request.resourceId);
    const originId = await requireOwnedResource(client, request);
    await lockPublicationIdentity(client, "origin", originId);
    await requireCurrentProof(client, request, originId);
    await requireLatestRevision(client, request, originId);
    const version = nextListingVersion(
      await currentListing(client, request.resourceId),
      request,
    );
    await persistPublication(client, request, originId, version);
    return Object.freeze({
      ...(await publicResourceByPublication(client, request.publicationId)),
      outcome: "created" as const,
    });
  });
}
