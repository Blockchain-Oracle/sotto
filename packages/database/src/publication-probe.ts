import type { Pool, PoolClient } from "pg";
import { CatalogConflictError } from "./catalog-types.js";
import {
  validateProbeObservation,
  type ValidatedProbeObservation,
} from "./publication-probe-validation.js";
import {
  PublicationIneligibleError,
  type ProbeObservationInput,
  type PublicationRecordResult,
} from "./publication-types.js";
import {
  lockPublicationIdentity,
  publicationTransaction,
} from "./publication-transaction.js";

async function existingObservation(
  client: PoolClient,
  observationId: string,
): Promise<string | undefined> {
  const result = await client.query<{ requestHash: string }>(
    `SELECT request_hash AS "requestHash"
     FROM sotto.probe_observations WHERE observation_id = $1`,
    [observationId],
  );
  return result.rows[0]?.requestHash;
}

export async function ensurePublicationResource(
  client: PoolClient,
  probe: Pick<
    ValidatedProbeObservation,
    "originId" | "resourceId" | "method" | "routeTemplate"
  >,
): Promise<void> {
  const origin = await client.query(
    "SELECT 1 FROM sotto.origins WHERE id = $1",
    [probe.originId],
  );
  if (origin.rowCount !== 1) throw new PublicationIneligibleError();
  await client.query(
    `INSERT INTO sotto.resources (id, origin_id, http_method, route_template)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [probe.resourceId, probe.originId, probe.method, probe.routeTemplate],
  );
  const resource = await client.query<{
    originId: string;
    method: string;
    routeTemplate: string;
  }>(
    `SELECT origin_id AS "originId", http_method AS "method",
            route_template AS "routeTemplate"
     FROM sotto.resources WHERE id = $1`,
    [probe.resourceId],
  );
  const row = resource.rows[0];
  if (
    row === undefined ||
    row.originId !== probe.originId ||
    row.method !== probe.method ||
    row.routeTemplate !== probe.routeTemplate
  ) {
    throw new CatalogConflictError();
  }
}

export async function persistValidatedProbeObservation(
  client: PoolClient,
  probe: ValidatedProbeObservation,
): Promise<"created" | "replayed"> {
  const existing = await existingObservation(client, probe.observationId);
  if (existing !== undefined) {
    if (existing !== probe.requestHash) throw new CatalogConflictError();
    return "replayed";
  }
  await ensurePublicationResource(client, probe);
  await insertObservation(client, probe);
  await insertRevision(client, probe);
  return "created";
}

async function insertObservation(
  client: PoolClient,
  probe: ValidatedProbeObservation,
): Promise<void> {
  await client.query(
    `INSERT INTO sotto.probe_observations
      (observation_id, request_hash, resource_id, origin_id, http_method,
       route_template, observed_at, http_status, evidence_hash, outcome,
       failure_code, revision_id, resource_name, description, challenge_hash,
       x402_version, scheme, network, asset, recipient, amount_atomic,
       transfer_method)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       $15, $16, $17, $18, $19, $20, $21, $22)`,
    [
      probe.observationId,
      probe.requestHash,
      probe.resourceId,
      probe.originId,
      probe.method,
      probe.routeTemplate,
      probe.observedAt,
      probe.httpStatus,
      probe.evidenceHash,
      probe.outcome,
      probe.failureCode,
      probe.revisionId,
      probe.resourceName,
      probe.description,
      probe.challengeHash,
      probe.x402Version,
      probe.scheme,
      probe.network,
      probe.asset,
      probe.recipient,
      probe.amountAtomic,
      probe.transferMethod,
    ],
  );
}

async function insertRevision(
  client: PoolClient,
  probe: ValidatedProbeObservation,
): Promise<void> {
  if (probe.outcome !== "verified-x402" || probe.revisionId === null) return;
  const latest = await client.query<{ revisionNumber: string }>(
    `SELECT COALESCE(max(revision_number), 0)::text AS "revisionNumber"
     FROM sotto.resource_revisions WHERE resource_id = $1`,
    [probe.resourceId],
  );
  const next = BigInt(latest.rows[0]!.revisionNumber) + 1n;
  await client.query(
    `INSERT INTO sotto.resource_revisions
      (revision_id, resource_id, origin_id, http_method, route_template,
       observation_id, revision_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      probe.revisionId,
      probe.resourceId,
      probe.originId,
      probe.method,
      probe.routeTemplate,
      probe.observationId,
      next.toString(),
    ],
  );
}

export async function recordProbeObservation(
  pool: Pool,
  candidate: ProbeObservationInput,
): Promise<PublicationRecordResult> {
  const probe = validateProbeObservation(candidate);
  return publicationTransaction(pool, async (client) => {
    await lockPublicationIdentity(client, "resource", probe.resourceId);
    const outcome = await persistValidatedProbeObservation(client, probe);
    return Object.freeze({ id: probe.observationId, outcome });
  });
}
