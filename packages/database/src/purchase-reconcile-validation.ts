import {
  exactKeys,
  integer,
  objectValue,
  sha256,
  time,
  uuid,
} from "./publication-validation-primitives.js";
import type {
  HumanReconciliationClaimInput,
  HumanReconciliationDeferInput,
  HumanReconciliationLease,
} from "./purchase-reconciliation-types.js";

const OWNER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MIN_LEASE_MS = 1_000;
const MAX_LEASE_MS = 60_000;
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

function optionalKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  const keys = Object.keys(value);
  if (
    required.some((key) => !keys.includes(key)) ||
    keys.some((key) => !required.includes(key) && !optional.includes(key))
  ) {
    throw new Error(`${label} keys are invalid`);
  }
}

function leaseOwner(value: unknown): string {
  if (typeof value !== "string" || !OWNER_PATTERN.test(value)) {
    throw new Error("reconciliation lease owner is invalid");
  }
  return value;
}

function duration(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  return integer(value ?? fallback, label, minimum, maximum);
}

export function reconciliationClaimInput(
  candidate: unknown,
): HumanReconciliationClaimInput {
  const value = objectValue(candidate, "reconciliation claim");
  optionalKeys(
    value,
    ["leaseOwner"],
    ["attemptId", "leaseMilliseconds"],
    "reconciliation claim",
  );
  return Object.freeze({
    leaseOwner: leaseOwner(value.leaseOwner),
    leaseMilliseconds: duration(
      value.leaseMilliseconds,
      30_000,
      MIN_LEASE_MS,
      MAX_LEASE_MS,
      "reconciliation lease duration",
    ),
    ...(value.attemptId === undefined
      ? {}
      : { attemptId: sha256(value.attemptId, "reconciliation attempt ID") }),
  });
}

export function reconciliationLease(
  candidate: unknown,
): HumanReconciliationLease {
  const value = objectValue(candidate, "reconciliation lease");
  exactKeys(
    value,
    [
      "jobId",
      "attemptId",
      "leaseGeneration",
      "leaseOwner",
      "claimedAt",
      "leaseExpiresAt",
    ],
    "reconciliation lease",
  );
  const claimedAt = time(value.claimedAt, "reconciliation claimed-at time");
  const leaseExpiresAt = time(
    value.leaseExpiresAt,
    "reconciliation lease expiry",
  );
  if (Date.parse(leaseExpiresAt) <= Date.parse(claimedAt)) {
    throw new Error("reconciliation lease window is invalid");
  }
  return Object.freeze({
    jobId: uuid(value.jobId, "reconciliation job ID"),
    attemptId: sha256(value.attemptId, "reconciliation attempt ID"),
    leaseGeneration: integer(
      value.leaseGeneration,
      "reconciliation lease generation",
      1,
    ),
    leaseOwner: leaseOwner(value.leaseOwner),
    claimedAt,
    leaseExpiresAt,
  });
}

export function reconciliationDeferInput(
  candidate: unknown,
): Required<HumanReconciliationDeferInput> {
  const value = objectValue(candidate, "reconciliation defer input");
  optionalKeys(
    value,
    ["lease", "expectedReconciliationOffset", "scannedThroughOffset"],
    ["backoffMilliseconds"],
    "reconciliation defer input",
  );
  const expectedReconciliationOffset = integer(
    value.expectedReconciliationOffset,
    "expected reconciliation offset",
    0,
  );
  const scannedThroughOffset = integer(
    value.scannedThroughOffset,
    "scanned-through reconciliation offset",
    expectedReconciliationOffset,
  );
  return Object.freeze({
    lease: reconciliationLease(value.lease),
    expectedReconciliationOffset,
    scannedThroughOffset,
    backoffMilliseconds: duration(
      value.backoffMilliseconds,
      1_000,
      MIN_BACKOFF_MS,
      MAX_BACKOFF_MS,
      "reconciliation backoff",
    ),
  });
}
