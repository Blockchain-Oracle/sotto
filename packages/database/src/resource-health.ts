import type { Pool, PoolClient } from "pg";
import {
  CatalogConflictError,
  CatalogPersistenceError,
} from "./catalog-types.js";
import {
  ensurePublicationResource,
  persistValidatedProbeObservation,
} from "./publication-probe.js";
import {
  lockPublicationIdentity,
  publicationTransaction,
} from "./publication-transaction.js";
import { sha256, uuid } from "./publication-validation-primitives.js";
import {
  validateProbeHealth,
  validateUnprobedHealth,
  type ValidatedResourceHealth,
} from "./resource-health-validation.js";
import type {
  ProbeHealthInput,
  ResourceHealthFailureCode,
  ResourceHealthFailureDomain,
  ResourceHealthInput,
  ResourceHealthObservation,
  ResourceHealthRecordResult,
  ResourceHealthStatus,
} from "./resource-health-types.js";
type HealthRow = Readonly<{
  healthObservationId: string;
  probeObservationId: string | null;
  resourceId: string;
  status: string;
  failureDomain: string | null;
  failureCode: string | null;
  httpStatus: number | null;
  operationHash: `sha256:${string}`;
  observedAt: Date;
  latencyMilliseconds: number;
}>;

const HEALTH_SELECT = `
  SELECT
    health_observation_id AS "healthObservationId",
    probe_observation_id AS "probeObservationId",
    resource_id AS "resourceId",
    status,
    failure_domain AS "failureDomain",
    failure_code AS "failureCode",
    http_status AS "httpStatus",
    operation_hash AS "operationHash",
    observed_at AS "observedAt",
    latency_milliseconds AS "latencyMilliseconds"
  FROM sotto.health_observations
`;

async function existingHealth(
  client: PoolClient,
  healthObservationId: string,
): Promise<string | undefined> {
  const result = await client.query<{ requestHash: string }>(
    `SELECT request_hash AS "requestHash"
     FROM sotto.health_observations WHERE health_observation_id = $1`,
    [healthObservationId],
  );
  return result.rows[0]?.requestHash;
}

async function insertHealth(
  client: PoolClient,
  health: ValidatedResourceHealth,
): Promise<void> {
  await client.query(
    `INSERT INTO sotto.health_observations
      (health_observation_id, request_hash, probe_observation_id,
       probe_outcome, resource_id, origin_id, http_method, route_template,
       operation_hash, observed_at, latency_milliseconds, status,
       failure_domain, failure_code, http_status, evidence_hash)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16)`,
    [
      health.healthObservationId,
      health.requestHash,
      health.probeObservationId,
      health.probeOutcome,
      health.resourceId,
      health.originId,
      health.method,
      health.routeTemplate,
      health.operationHash,
      health.observedAt,
      health.latencyMilliseconds,
      health.status,
      health.failureDomain,
      health.failureCode,
      health.httpStatus,
      health.evidenceHash,
    ],
  );
}

async function persistHealth(
  client: PoolClient,
  health: ValidatedResourceHealth,
): Promise<ResourceHealthRecordResult> {
  const existing = await existingHealth(client, health.healthObservationId);
  if (existing !== undefined) {
    if (existing !== health.requestHash) throw new CatalogConflictError();
    return Object.freeze({
      id: health.healthObservationId,
      outcome: "replayed",
    });
  }
  await insertHealth(client, health);
  return Object.freeze({ id: health.healthObservationId, outcome: "created" });
}

export async function recordProbeHealth(
  pool: Pool,
  input: ProbeHealthInput,
): Promise<ResourceHealthRecordResult> {
  const { probe, health } = validateProbeHealth(input);
  return publicationTransaction(pool, async (client) => {
    await lockPublicationIdentity(client, "resource", health.resourceId);
    await persistValidatedProbeObservation(client, probe);
    return persistHealth(client, health);
  });
}

export async function recordHealthObservation(
  pool: Pool,
  input: ResourceHealthInput,
): Promise<ResourceHealthRecordResult> {
  const health = validateUnprobedHealth(input);
  return publicationTransaction(pool, async (client) => {
    await lockPublicationIdentity(client, "resource", health.resourceId);
    const existing = await existingHealth(client, health.healthObservationId);
    if (existing !== undefined) return persistHealth(client, health);
    await ensurePublicationResource(client, health);
    return persistHealth(client, health);
  });
}

function healthRecord(row: HealthRow): ResourceHealthObservation {
  const statuses = new Set(["healthy", "degraded", "failing"]);
  const domains = new Set([
    "transport",
    "payment-contract",
    "provider-handler",
  ]);
  const codes = new Set([
    "DNS_OR_NETWORK",
    "TIMEOUT",
    "HTTP_STATUS",
    "HTTP_200",
    "MISSING_PAYMENT_REQUIRED",
    "UNSUPPORTED_REQUIREMENT",
  ]);
  if (
    !statuses.has(row.status) ||
    (row.failureDomain !== null && !domains.has(row.failureDomain)) ||
    (row.failureCode !== null && !codes.has(row.failureCode)) ||
    (row.httpStatus !== null &&
      (!Number.isSafeInteger(row.httpStatus) ||
        row.httpStatus < 100 ||
        row.httpStatus > 599)) ||
    !(row.observedAt instanceof Date) ||
    !Number.isSafeInteger(row.latencyMilliseconds)
  ) {
    throw new CatalogPersistenceError();
  }
  return Object.freeze({
    ...row,
    operationHash: sha256(row.operationHash, "stored health operation hash"),
    status: row.status as ResourceHealthStatus,
    failureDomain: row.failureDomain as ResourceHealthFailureDomain | null,
    failureCode: row.failureCode as ResourceHealthFailureCode | null,
    observedAt: row.observedAt.toISOString(),
  });
}

export async function findLatestResourceHealth(
  pool: Pool,
  resourceId: string,
): Promise<ResourceHealthObservation | null> {
  try {
    const result = await pool.query<HealthRow>(
      `${HEALTH_SELECT}
       WHERE resource_id = $1
       ORDER BY observed_at DESC, health_observation_id DESC
       LIMIT 1`,
      [uuid(resourceId, "health resource ID")],
    );
    return result.rows[0] === undefined ? null : healthRecord(result.rows[0]);
  } catch {
    throw new CatalogPersistenceError();
  }
}
