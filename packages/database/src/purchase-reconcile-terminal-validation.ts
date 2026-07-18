import {
  exactKeys,
  integer,
  objectValue,
} from "./publication-validation-primitives.js";
import { reconciliationLease } from "./purchase-reconcile-validation.js";
import type {
  HumanReconciliationCheckpointInput,
  HumanReconciliationCompletion,
} from "./purchase-reconciliation-types.js";

const UPDATE_ID = /^1220[0-9a-f]{64}$/u;

function completion(
  candidate: unknown,
  expectedOffset: number,
): HumanReconciliationCompletion {
  const value = objectValue(candidate, "reconciliation completion");
  const classification = value.classification;
  const completionOffset = integer(
    value.completionOffset,
    "reconciliation completion offset",
    expectedOffset + 1,
  );
  if (classification === "SUCCEEDED") {
    exactKeys(
      value,
      ["classification", "completionOffset", "updateId"],
      "successful reconciliation completion",
    );
    if (typeof value.updateId !== "string" || !UPDATE_ID.test(value.updateId)) {
      throw new Error("reconciliation update ID is invalid");
    }
    return Object.freeze({
      classification,
      completionOffset,
      updateId: value.updateId,
    });
  }
  if (classification === "REJECTED") {
    exactKeys(
      value,
      ["classification", "completionOffset", "statusCode"],
      "rejected reconciliation completion",
    );
    return Object.freeze({
      classification,
      completionOffset,
      statusCode: integer(
        value.statusCode,
        "reconciliation rejection status",
        1,
        16,
      ),
    });
  }
  throw new Error("reconciliation completion classification is invalid");
}

export function reconciliationCheckpointInput(
  candidate: unknown,
): HumanReconciliationCheckpointInput {
  const value = objectValue(candidate, "reconciliation checkpoint");
  exactKeys(
    value,
    ["lease", "expectedReconciliationOffset", "completion"],
    "reconciliation checkpoint",
  );
  const expectedReconciliationOffset = integer(
    value.expectedReconciliationOffset,
    "expected reconciliation offset",
    0,
  );
  return Object.freeze({
    lease: reconciliationLease(value.lease),
    expectedReconciliationOffset,
    completion: completion(value.completion, expectedReconciliationOffset),
  });
}
