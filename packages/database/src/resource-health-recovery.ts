import type { Pool } from "pg";
import { CatalogPersistenceError } from "./catalog-types.js";
import type { ProbeObservationInput } from "./publication-types.js";
import { uuid } from "./publication-validation-primitives.js";
import {
  RECOVERY_SELECT,
  type RecoveryRow,
} from "./resource-health-recovery-query.js";
import {
  validateProbeHealth,
  validateUnprobedHealth,
} from "./resource-health-validation.js";
import type {
  PersistedProbeHealth,
  ResourceHealthInput,
  ResourceHealthResult,
} from "./resource-health-types.js";

function iso(value: Date | null, label: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`${label} is invalid`);
  }
  return value.toISOString();
}

function healthResult(row: RecoveryRow): ResourceHealthResult {
  const exact = (
    status: string,
    domain: string | null,
    code: string | null,
    httpStatus: number | null,
  ) =>
    row.healthStatus === status &&
    row.healthFailureDomain === domain &&
    row.healthFailureCode === code &&
    row.healthHttpStatus === httpStatus;
  if (exact("healthy", null, null, null))
    return Object.freeze({ kind: "healthy" });
  if (exact("degraded", null, null, null)) {
    return Object.freeze({ kind: "degraded" });
  }
  if (
    row.healthFailureDomain === "transport" &&
    row.healthHttpStatus === null &&
    (row.healthFailureCode === "DNS_OR_NETWORK" ||
      row.healthFailureCode === "TIMEOUT") &&
    row.healthStatus === "failing"
  ) {
    return Object.freeze({
      kind: "failing",
      domain: "transport",
      code: row.healthFailureCode,
    });
  }
  if (
    row.healthFailureDomain === "payment-contract" &&
    row.healthHttpStatus === null &&
    (row.healthFailureCode === "HTTP_200" ||
      row.healthFailureCode === "MISSING_PAYMENT_REQUIRED" ||
      row.healthFailureCode === "UNSUPPORTED_REQUIREMENT") &&
    row.healthStatus === "failing"
  ) {
    return Object.freeze({
      kind: "failing",
      domain: "payment-contract",
      code: row.healthFailureCode,
    });
  }
  if (
    row.healthStatus === "failing" &&
    row.healthFailureDomain === "provider-handler" &&
    row.healthFailureCode === "HTTP_STATUS" &&
    row.healthHttpStatus !== null
  ) {
    return Object.freeze({
      kind: "failing",
      domain: "provider-handler",
      code: "HTTP_STATUS",
      httpStatus: row.healthHttpStatus,
    });
  }
  throw new Error("stored resource health result is invalid");
}

function probeInput(row: RecoveryRow): ProbeObservationInput | null {
  if (row.probeObservationId === null) {
    if (
      row.healthProbeOutcome !== null ||
      row.probeRequestHash !== null ||
      row.probeOutcome !== null
    ) {
      throw new Error("stored probe link is invalid");
    }
    return null;
  }
  if (
    row.probeOutcome !== row.healthProbeOutcome ||
    row.probeObservedAt === null ||
    row.probeHttpStatus === null ||
    row.probeEvidenceHash === null
  ) {
    throw new Error("stored probe identity is invalid");
  }
  const common = {
    observationId: row.probeObservationId,
    originId: row.originId,
    resourceId: row.resourceId,
    method: row.method,
    routeTemplate: row.routeTemplate,
    observedAt: iso(row.probeObservedAt, "stored probe time"),
    httpStatus: row.probeHttpStatus,
    evidenceHash: row.probeEvidenceHash,
  };
  if (row.probeOutcome === "non-x402" && row.probeFailureCode !== null) {
    return Object.freeze({
      ...common,
      result: Object.freeze({
        kind: "non-x402" as const,
        reason: row.probeFailureCode,
      }),
    }) as ProbeObservationInput;
  }
  if (row.probeOutcome === "verified-x402") {
    return Object.freeze({
      ...common,
      result: Object.freeze({
        kind: "verified-x402" as const,
        revisionId: row.probeRevisionId,
        name: row.probeResourceName,
        description: row.probeDescription,
        challengeHash: row.probeChallengeHash,
        x402Version: row.probeX402Version,
        scheme: row.probeScheme,
        network: row.probeNetwork,
        asset: row.probeAsset,
        recipient: row.probeRecipient,
        amountAtomic: row.probeAmountAtomic,
        transferMethod: row.probeTransferMethod,
      }),
    }) as ProbeObservationInput;
  }
  throw new Error("stored probe outcome is invalid");
}

function healthInput(row: RecoveryRow): ResourceHealthInput {
  return Object.freeze({
    healthObservationId: row.healthObservationId,
    originId: row.originId,
    resourceId: row.resourceId,
    method: row.method,
    routeTemplate: row.routeTemplate,
    observedAt: iso(row.observedAt, "stored health time"),
    latencyMilliseconds: row.latencyMilliseconds,
    operationHash: row.operationHash,
    evidenceHash: row.healthEvidenceHash,
    result: healthResult(row),
  }) as ResourceHealthInput;
}

function recover(row: RecoveryRow): PersistedProbeHealth {
  const probe = probeInput(row);
  const health = healthInput(row);
  if (probe === null) {
    if (validateUnprobedHealth(health).requestHash !== row.healthRequestHash) {
      throw new Error("stored probe health hash is invalid");
    }
    return Object.freeze({ probe, health });
  }
  const validated = validateProbeHealth({ probe, health });
  if (
    validated.health.requestHash !== row.healthRequestHash ||
    validated.probe.requestHash !== row.probeRequestHash
  ) {
    throw new Error("stored probe health hash is invalid");
  }
  return Object.freeze({ probe, health });
}

export async function findProbeHealthById(
  pool: Pool,
  healthObservationId: string,
): Promise<PersistedProbeHealth | null> {
  try {
    const result = await pool.query<RecoveryRow>(RECOVERY_SELECT, [
      uuid(healthObservationId, "health observation ID"),
    ]);
    return result.rows[0] === undefined ? null : recover(result.rows[0]);
  } catch (error) {
    if (error instanceof CatalogPersistenceError) throw error;
    throw new CatalogPersistenceError();
  }
}
