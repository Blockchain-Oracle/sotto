import { createHash } from "node:crypto";
import type { PurchaseAggregateRow } from "./purchase-query.js";
import {
  PurchaseConflictError,
  PurchasePersistenceError,
  type HumanPurchaseAttemptResult,
} from "./purchase-types.js";
import { uuid } from "./publication-validation-primitives.js";
import type { ValidatedHumanPurchaseAttempt } from "./purchase-validation.js";

function timestamp(value: unknown): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new PurchasePersistenceError();
  }
  return value.toISOString();
}

function digest(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function exactStoredIdentity(
  row: PurchaseAggregateRow,
  expected: ValidatedHumanPurchaseAttempt,
  outcome: "created" | "replayed",
): void {
  const identities = [
    [row.attemptId, expected.attemptId],
    [row.operationId, expected.operationId],
    [row.ownerId, expected.ownerId],
    [row.resourceRevisionId, expected.resourceRevisionId],
    [row.authorizationMode, expected.authorizationMode],
    [row.commitmentVersion, expected.commitmentVersion],
    [row.requestCommitment, expected.requestCommitment],
    [row.challengeId, expected.challengeId],
    [row.purchaseCommitment, expected.purchaseCommitment],
    [row.commandId, expected.commandId],
    [row.beginExclusive, String(expected.beginExclusive)],
    [timestamp(row.executeBefore), expected.executeBefore],
  ];
  if (identities.some(([actual, wanted]) => actual !== wanted)) {
    throw new PurchaseConflictError();
  }
  const structure = [
    [row.state, expected.state],
    [row.eventSequence, String(expected.eventSequence)],
    [row.eventType, expected.eventType],
    [row.previousEventHash, null],
    [row.jobKind, expected.jobKind],
    [row.jobState, expected.jobState],
  ];
  if (structure.some(([actual, wanted]) => actual !== wanted)) {
    throw new PurchasePersistenceError();
  }
  const storedEventHash = digest(
    `sotto-purchase-intent-event-v1\0${row.requestHash}`,
  );
  const storedJobDedupe = digest(
    `sotto-purchase-prepare-job-v1\0${row.operationId}\0${storedEventHash}`,
  );
  if (
    !/^[0-9a-f]{64}$/u.test(row.requestHash) ||
    !/^[0-9a-f]{40}$/u.test(row.sourceCommit) ||
    row.eventHash !== storedEventHash ||
    row.jobDedupeKey !== storedJobDedupe ||
    (outcome === "created" &&
      (row.requestHash !== expected.requestHash ||
        row.sourceCommit !== expected.sourceCommit ||
        row.eventHash !== expected.eventHash ||
        row.jobDedupeKey !== expected.jobDedupeKey))
  ) {
    throw new PurchasePersistenceError();
  }
}

export function purchaseAggregateResult(
  row: PurchaseAggregateRow,
  expected: ValidatedHumanPurchaseAttempt,
  outcome: "created" | "replayed",
): HumanPurchaseAttemptResult {
  exactStoredIdentity(row, expected, outcome);
  if (
    row.jobId === null ||
    row.eventHash === null ||
    row.jobDedupeKey === null ||
    row.eventRecordedAt === null ||
    row.jobAvailableAt === null ||
    row.jobCreatedAt === null
  ) {
    throw new PurchasePersistenceError();
  }
  return Object.freeze({
    outcome,
    operationId: expected.operationId,
    attemptId: expected.attemptId,
    ownerId: expected.ownerId,
    resourceRevisionId: expected.resourceRevisionId,
    authorizationMode: expected.authorizationMode,
    commitmentVersion: expected.commitmentVersion,
    requestCommitment: expected.requestCommitment,
    challengeId: expected.challengeId,
    purchaseCommitment: expected.purchaseCommitment,
    commandId: expected.commandId,
    beginExclusive: expected.beginExclusive,
    executeBefore: expected.executeBefore,
    sourceCommit: row.sourceCommit,
    state: expected.state,
    createdAt: timestamp(row.createdAt),
    event: Object.freeze({
      sequence: expected.eventSequence,
      type: expected.eventType,
      eventHash: row.eventHash as `sha256:${string}`,
      previousEventHash: null,
      recordedAt: timestamp(row.eventRecordedAt),
    }),
    job: Object.freeze({
      jobId: uuid(row.jobId, "stored purchase job ID"),
      dedupeKey: row.jobDedupeKey as `sha256:${string}`,
      kind: expected.jobKind,
      state: expected.jobState,
      availableAt: timestamp(row.jobAvailableAt),
      createdAt: timestamp(row.jobCreatedAt),
    }),
  });
}
