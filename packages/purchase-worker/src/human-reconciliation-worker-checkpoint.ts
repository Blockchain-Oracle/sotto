import type {
  HumanReconciliationCheckpointResult,
  HumanReconciliationCompletion,
  HumanReconciliationDeferResult,
  HumanReconciliationLease,
} from "@sotto/database";
import {
  reconciliationExactKeys,
  reconciliationInteger,
  reconciliationObject,
  reconciliationSha256,
  reconciliationText,
} from "./human-reconciliation-worker-primitives.js";

function time(value: unknown, label: string): string {
  const candidate = reconciliationText(value, label);
  const milliseconds = Date.parse(candidate);
  if (
    !Number.isSafeInteger(milliseconds) ||
    new Date(milliseconds).toISOString() !== candidate
  ) {
    throw new Error(`${label} is invalid`);
  }
  return candidate;
}

export function requireReconciliationDeferCheckpoint(
  candidate: HumanReconciliationDeferResult,
  lease: HumanReconciliationLease,
  scannedThroughOffset: number,
): HumanReconciliationDeferResult {
  const value = reconciliationObject(candidate, "reconciliation defer result");
  reconciliationExactKeys(
    value,
    ["outcome", "attemptId", "reconciliationOffset", "job"],
    "reconciliation defer result",
  );
  const job = reconciliationObject(value.job, "reconciliation deferred job");
  reconciliationExactKeys(
    job,
    ["jobId", "state", "leaseGeneration", "availableAt"],
    "reconciliation deferred job",
  );
  if (
    value.outcome !== "requeued" ||
    value.attemptId !== lease.attemptId ||
    value.reconciliationOffset !== scannedThroughOffset ||
    job.jobId !== lease.jobId ||
    job.state !== "ready" ||
    job.leaseGeneration !== lease.leaseGeneration
  ) {
    throw new Error("human reconciliation defer checkpoint does not match");
  }
  return Object.freeze({
    outcome: "requeued" as const,
    attemptId: lease.attemptId,
    reconciliationOffset: scannedThroughOffset,
    job: Object.freeze({
      jobId: lease.jobId,
      state: "ready" as const,
      leaseGeneration: lease.leaseGeneration,
      availableAt: time(job.availableAt, "reconciliation available time"),
    }),
  });
}

function exactCompletion(
  candidate: unknown,
  expected: HumanReconciliationCompletion,
): HumanReconciliationCompletion {
  const value = reconciliationObject(candidate, "reconciliation completion");
  reconciliationExactKeys(
    value,
    expected.classification === "SUCCEEDED"
      ? ["classification", "completionOffset", "updateId"]
      : ["classification", "completionOffset", "statusCode"],
    "reconciliation completion",
  );
  const same =
    value.classification === expected.classification &&
    value.completionOffset === expected.completionOffset &&
    (expected.classification === "SUCCEEDED"
      ? value.updateId === expected.updateId
      : value.statusCode === expected.statusCode);
  if (!same) {
    throw new Error("human reconciliation completion does not match");
  }
  return expected;
}

export function requireReconciliationTerminalCheckpoint(
  candidate: HumanReconciliationCheckpointResult,
  lease: HumanReconciliationLease,
  expectedReconciliationOffset: number,
  completion: HumanReconciliationCompletion,
): HumanReconciliationCheckpointResult {
  const value = reconciliationObject(
    candidate,
    "reconciliation terminal result",
  );
  reconciliationExactKeys(
    value,
    [
      "outcome",
      "attemptId",
      "state",
      "completion",
      "reconciliationOffset",
      "reconciledAt",
      "event",
      "job",
    ],
    "reconciliation terminal result",
  );
  const event = reconciliationObject(value.event, "reconciliation event");
  reconciliationExactKeys(
    event,
    ["sequence", "type", "eventHash", "previousEventHash", "recordedAt"],
    "reconciliation event",
  );
  const job = reconciliationObject(value.job, "reconciliation completed job");
  reconciliationExactKeys(
    job,
    ["jobId", "state", "leaseGeneration", "resultEventSequence", "completedAt"],
    "reconciliation completed job",
  );
  const expectedState =
    completion.classification === "SUCCEEDED"
      ? "settlement-reconciled"
      : "settlement-rejected";
  if (
    (value.outcome !== "created" && value.outcome !== "replayed") ||
    value.attemptId !== lease.attemptId ||
    value.state !== expectedState ||
    value.reconciliationOffset !== expectedReconciliationOffset ||
    event.sequence !== 6 ||
    event.type !== expectedState ||
    job.jobId !== lease.jobId ||
    job.state !== "completed" ||
    job.leaseGeneration !== lease.leaseGeneration ||
    job.resultEventSequence !== 6
  ) {
    throw new Error("human reconciliation terminal checkpoint does not match");
  }
  return Object.freeze({
    outcome: value.outcome,
    attemptId: lease.attemptId,
    state: expectedState,
    completion: exactCompletion(value.completion, completion),
    reconciliationOffset: expectedReconciliationOffset,
    reconciledAt: time(value.reconciledAt, "reconciled time"),
    event: Object.freeze({
      sequence: 6 as const,
      type: expectedState,
      eventHash: reconciliationSha256(event.eventHash, "event hash"),
      previousEventHash: reconciliationSha256(
        event.previousEventHash,
        "previous event hash",
      ),
      recordedAt: time(event.recordedAt, "event recorded time"),
    }),
    job: Object.freeze({
      jobId: lease.jobId,
      state: "completed" as const,
      leaseGeneration: reconciliationInteger(
        job.leaseGeneration,
        1,
        "completed lease generation",
      ),
      resultEventSequence: 6 as const,
      completedAt: time(job.completedAt, "job completed time"),
    }),
  });
}
