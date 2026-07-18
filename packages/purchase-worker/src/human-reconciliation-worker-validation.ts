import {
  RECONCILIATION_LEASE_OWNER_PATTERN,
  RECONCILIATION_UPDATE_ID_PATTERN,
  reconciliationExactKeys,
  reconciliationInteger,
  reconciliationObject,
  reconciliationSha256,
} from "./human-reconciliation-worker-primitives.js";
import type {
  HumanReconciliationProbeRequest,
  HumanReconciliationWorkerDependencies,
  HumanReconciliationWorkerInput,
} from "./human-reconciliation-worker-types.js";

export function reconciliationWorkerDependencies(
  candidate: unknown,
): HumanReconciliationWorkerDependencies {
  const value = reconciliationObject(
    candidate,
    "human reconciliation dependencies",
  );
  reconciliationExactKeys(
    value,
    ["repository", "readReconciliation"],
    "human reconciliation dependencies",
  );
  const repository = reconciliationObject(
    value.repository,
    "human reconciliation repository",
  );
  reconciliationExactKeys(
    repository,
    [
      "claimHumanReconciliation",
      "completeHumanReconciliation",
      "deferHumanReconciliation",
    ],
    "human reconciliation repository",
  );
  if (
    typeof repository.claimHumanReconciliation !== "function" ||
    typeof repository.completeHumanReconciliation !== "function" ||
    typeof repository.deferHumanReconciliation !== "function" ||
    typeof value.readReconciliation !== "function"
  ) {
    throw new Error("human reconciliation dependencies are invalid");
  }
  return value as HumanReconciliationWorkerDependencies;
}

export function reconciliationWorkerInput(
  candidate: unknown,
): HumanReconciliationWorkerInput {
  const value = reconciliationObject(
    candidate,
    "human reconciliation worker input",
  );
  const expected = [
    "leaseOwner",
    ...(value.attemptId === undefined ? [] : ["attemptId"]),
    ...(value.signal === undefined ? [] : ["signal"]),
  ];
  reconciliationExactKeys(value, expected, "human reconciliation worker input");
  if (
    typeof value.leaseOwner !== "string" ||
    !RECONCILIATION_LEASE_OWNER_PATTERN.test(value.leaseOwner)
  ) {
    throw new Error("human reconciliation lease owner is invalid");
  }
  if (value.signal !== undefined && !(value.signal instanceof AbortSignal)) {
    throw new Error("human reconciliation signal is invalid");
  }
  return Object.freeze({
    leaseOwner: value.leaseOwner,
    ...(value.attemptId === undefined
      ? {}
      : {
          attemptId: reconciliationSha256(
            value.attemptId,
            "reconciliation attempt ID",
          ),
        }),
    ...(value.signal === undefined
      ? {}
      : { signal: value.signal as AbortSignal }),
  });
}

export type ValidatedReconciliationProbe =
  | Readonly<{ outcome: "pending"; scannedThroughOffset: number }>
  | Readonly<{
      outcome: "rejected";
      completionOffset: number;
      statusCode: number;
    }>
  | Readonly<{
      outcome: "succeeded";
      completionOffset: number;
      updateId: string;
      transaction: unknown;
    }>;

function terminalOffset(
  value: Record<string, unknown>,
  currentOffset: number,
): number {
  return reconciliationInteger(
    value.completionOffset,
    currentOffset + 1,
    "completion offset",
  );
}

export function reconciliationProbe(
  candidate: unknown,
  currentOffset: number,
  expected: HumanReconciliationProbeRequest,
): ValidatedReconciliationProbe {
  const value = reconciliationObject(candidate, "human reconciliation probe");
  if (value.outcome === "pending") {
    reconciliationExactKeys(
      value,
      ["outcome", "scannedThroughOffset"],
      "pending probe",
    );
    return Object.freeze({
      outcome: "pending",
      scannedThroughOffset: reconciliationInteger(
        value.scannedThroughOffset,
        currentOffset,
        "scanned-through offset",
      ),
    });
  }
  if (value.outcome === "rejected") {
    reconciliationExactKeys(
      value,
      [
        "outcome",
        "completionOffset",
        "statusCode",
        "submissionId",
        "synchronizerId",
      ],
      "rejected probe",
    );
    const statusCode = reconciliationInteger(
      value.statusCode,
      1,
      "rejection status",
    );
    if (statusCode > 16) throw new Error("rejection status is invalid");
    if (
      value.submissionId !== expected.submissionId ||
      value.synchronizerId !== expected.synchronizerId
    ) {
      throw new Error("rejected completion identity does not match");
    }
    return Object.freeze({
      outcome: "rejected",
      completionOffset: terminalOffset(value, currentOffset),
      statusCode,
    });
  }
  if (value.outcome === "succeeded") {
    reconciliationExactKeys(
      value,
      [
        "outcome",
        "completionOffset",
        "updateId",
        "submissionId",
        "synchronizerId",
        "transaction",
      ],
      "successful probe",
    );
    if (
      typeof value.updateId !== "string" ||
      !RECONCILIATION_UPDATE_ID_PATTERN.test(value.updateId)
    ) {
      throw new Error("successful reconciliation update ID is invalid");
    }
    if (
      value.submissionId !== expected.submissionId ||
      value.synchronizerId !== expected.synchronizerId
    ) {
      throw new Error("successful completion identity does not match");
    }
    return Object.freeze({
      outcome: "succeeded",
      completionOffset: terminalOffset(value, currentOffset),
      updateId: value.updateId,
      transaction: value.transaction,
    });
  }
  throw new Error("human reconciliation probe outcome is invalid");
}
