import { createHash } from "node:crypto";
import type { PurchaseAggregateRow } from "./purchase-query.js";
import { purchaseLifecycle } from "./purchase-query-lifecycle.js";
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

function validateIdentity(
  row: PurchaseAggregateRow,
  expected: ValidatedHumanPurchaseAttempt,
  outcome: "created" | "replayed",
): `sha256:${string}` {
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
  const eventHash = digest(
    `sotto-purchase-intent-event-v1\0${row.requestHash}`,
  );
  const jobDedupe = digest(
    `sotto-purchase-prepare-job-v1\0${row.operationId}\0${eventHash}`,
  );
  if (
    !/^[0-9a-f]{64}$/u.test(row.requestHash) ||
    !/^[0-9a-f]{40}$/u.test(row.sourceCommit) ||
    row.eventSequence !== "1" ||
    row.eventType !== "intent-created" ||
    row.eventHash !== eventHash ||
    row.previousEventHash !== null ||
    row.jobDedupeKey !== jobDedupe ||
    row.jobKind !== "purchase-prepare" ||
    (outcome === "created" &&
      (row.requestHash !== expected.requestHash ||
        row.sourceCommit !== expected.sourceCommit ||
        row.eventHash !== expected.eventHash ||
        row.jobDedupeKey !== expected.jobDedupeKey))
  ) {
    throw new PurchasePersistenceError();
  }
  return eventHash;
}

export function purchaseAggregateResult(
  row: PurchaseAggregateRow,
  expected: ValidatedHumanPurchaseAttempt,
  outcome: "created" | "replayed",
): HumanPurchaseAttemptResult {
  const initialEventHash = validateIdentity(row, expected, outcome);
  if (
    row.jobId === null ||
    row.eventRecordedAt === null ||
    row.jobAvailableAt === null ||
    row.jobCreatedAt === null ||
    row.jobDedupeKey === null
  ) {
    throw new PurchasePersistenceError();
  }
  const lifecycle = purchaseLifecycle(row, initialEventHash, outcome);
  const base = {
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
    createdAt: timestamp(row.createdAt),
  };
  const jobBase = {
    jobId: uuid(row.jobId, "stored purchase job ID"),
    dedupeKey: row.jobDedupeKey as `sha256:${string}`,
    kind: "purchase-prepare" as const,
    availableAt: timestamp(row.jobAvailableAt),
    createdAt: timestamp(row.jobCreatedAt),
  };
  if (lifecycle.state === "prepared-hash-verified") {
    return Object.freeze({
      ...base,
      outcome: "replayed" as const,
      ...lifecycle,
      job: Object.freeze({ ...jobBase, ...lifecycle.job }),
    });
  }
  return Object.freeze({
    ...base,
    ...lifecycle,
    event: Object.freeze({
      sequence: 1 as const,
      type: "intent-created" as const,
      eventHash: initialEventHash,
      previousEventHash: null,
      recordedAt: timestamp(row.eventRecordedAt),
    }),
    job: Object.freeze({ ...jobBase, ...lifecycle.job }),
  }) as HumanPurchaseAttemptResult;
}
