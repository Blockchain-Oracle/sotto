import { createHash } from "node:crypto";
import type { PurchaseAggregateRow } from "./purchase-query.js";
import { PurchasePersistenceError } from "./purchase-types.js";

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const LEASE_OWNER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function timestamp(value: unknown): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new PurchasePersistenceError();
  }
  return value.toISOString();
}

function lease(row: PurchaseAggregateRow) {
  const generation = Number(row.jobLeaseGeneration);
  if (
    !Number.isSafeInteger(generation) ||
    generation < 1 ||
    typeof row.jobLeaseOwner !== "string" ||
    !LEASE_OWNER.test(row.jobLeaseOwner)
  ) {
    throw new PurchasePersistenceError();
  }
  const claimedAt = timestamp(row.jobClaimedAt);
  const leaseExpiresAt = timestamp(row.jobLeaseExpiresAt);
  if (Date.parse(leaseExpiresAt) <= Date.parse(claimedAt)) {
    throw new PurchasePersistenceError();
  }
  return Object.freeze({
    leaseGeneration: generation,
    leaseOwner: row.jobLeaseOwner,
    leaseExpiresAt,
    claimedAt,
  });
}

function requireNoCheckpoint(row: PurchaseAggregateRow): void {
  if (
    row.preparedTransactionHash !== null ||
    row.transferContextHash !== null ||
    row.preparedVerifiedAt !== null ||
    row.resultEventSequence !== null ||
    row.resultEventType !== null ||
    row.resultEventHash !== null ||
    row.resultPreviousEventHash !== null ||
    row.resultPreparedTransactionHash !== null ||
    row.resultTransferContextHash !== null ||
    row.resultPreparedVerifiedAt !== null ||
    row.resultEventRecordedAt !== null ||
    row.jobResultEventSequence !== null ||
    row.jobCompletedAt !== null ||
    row.authorityAttemptId !== row.attemptId ||
    row.authorityRetiredAt !== null
  ) {
    throw new PurchasePersistenceError();
  }
}

function preparedLifecycle(row: PurchaseAggregateRow, initialHash: string) {
  const preparedHash = row.preparedTransactionHash;
  const contextHash = row.transferContextHash;
  const verifiedAt = timestamp(row.preparedVerifiedAt);
  const recordedAt = timestamp(row.resultEventRecordedAt);
  const completedAt = timestamp(row.jobCompletedAt);
  const authorityRetiredAt = timestamp(row.authorityRetiredAt);
  const leaseState = lease(row);
  if (
    !SHA256.test(preparedHash ?? "") ||
    !SHA256.test(contextHash ?? "") ||
    row.resultEventSequence !== "2" ||
    row.resultEventType !== "prepared-hash-verified" ||
    row.resultPreviousEventHash !== initialHash ||
    row.resultPreparedTransactionHash !== preparedHash ||
    row.resultTransferContextHash !== contextHash ||
    timestamp(row.resultPreparedVerifiedAt) !== verifiedAt ||
    row.jobResultEventSequence !== "2" ||
    row.authorityAttemptId !== row.attemptId ||
    recordedAt !== completedAt ||
    completedAt !== authorityRetiredAt ||
    Date.parse(verifiedAt) > Date.parse(recordedAt) ||
    Date.parse(completedAt) > Date.parse(leaseState.leaseExpiresAt)
  ) {
    throw new PurchasePersistenceError();
  }
  const eventBody = `sotto-prepared-hash-verified-event-v1\0${row.attemptId}\0${preparedHash}\0${contextHash}\0${verifiedAt}\0${initialHash}`;
  const eventHash = `sha256:${createHash("sha256").update(eventBody, "utf8").digest("hex")}`;
  if (row.resultEventHash !== eventHash) throw new PurchasePersistenceError();
  return Object.freeze({
    state: "prepared-hash-verified" as const,
    prepared: Object.freeze({
      preparedTransactionHash: preparedHash as `sha256:${string}`,
      transferContextHash: contextHash as `sha256:${string}`,
      verifiedAt,
    }),
    event: Object.freeze({
      sequence: 2 as const,
      type: "prepared-hash-verified" as const,
      eventHash: eventHash as `sha256:${string}`,
      previousEventHash: initialHash as `sha256:${string}`,
      recordedAt,
    }),
    job: Object.freeze({
      state: "completed" as const,
      ...leaseState,
      resultEventSequence: 2 as const,
      completedAt,
    }),
  });
}

export function purchaseLifecycle(
  row: PurchaseAggregateRow,
  initialHash: string,
  outcome: "created" | "replayed",
) {
  if (row.state === "intent-created") {
    requireNoCheckpoint(row);
    if (
      row.jobState === "ready" &&
      row.jobLeaseGeneration === "0" &&
      row.jobLeaseOwner === null &&
      row.jobLeaseExpiresAt === null &&
      row.jobClaimedAt === null
    ) {
      return Object.freeze({
        state: "intent-created" as const,
        job: Object.freeze({ state: "ready" as const }),
      });
    }
    if (row.jobState === "leased" && outcome === "replayed") {
      return Object.freeze({
        state: "intent-created" as const,
        job: Object.freeze({ state: "leased" as const, ...lease(row) }),
      });
    }
  } else if (
    row.state === "prepared-hash-verified" &&
    row.jobState === "completed" &&
    outcome === "replayed"
  ) {
    return preparedLifecycle(row, initialHash);
  }
  throw new PurchasePersistenceError();
}
