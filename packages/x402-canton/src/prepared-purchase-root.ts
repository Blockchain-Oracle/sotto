import type { Exercise, Value } from "@canton-network/core-ledger-proto";
import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

const CHOICE_FIELDS = [
  "attemptId",
  "purchaseCommitment",
  "requestCommitment",
  "challengeId",
  "resourceHash",
  "recipient",
  "amount",
  "requestedAt",
  "executeBefore",
  "inputHoldingCids",
  "extraArgs",
  "expectedRevision",
] as const;

function exactParties(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  if (
    new Set(actual).size !== actual.length ||
    JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())
  ) {
    throw new Error(`${label} do not match the bounded Purchase`);
  }
}

function fields(value: Value | undefined): Map<string, Value> {
  if (value?.sum.oneofKind !== "record") {
    throw new Error("prepared Purchase choice argument must be a record");
  }
  const result = new Map<string, Value>();
  for (const field of value.sum.record.fields) {
    if (!field.label || field.value === undefined || result.has(field.label)) {
      throw new Error("prepared Purchase choice fields are ambiguous");
    }
    result.set(field.label, field.value);
  }
  if (
    JSON.stringify([...result.keys()].sort()) !==
    JSON.stringify([...CHOICE_FIELDS].sort())
  ) {
    throw new Error("prepared Purchase choice fields are incomplete");
  }
  return result;
}

function scalar(
  value: Value | undefined,
  kind: "text" | "party" | "numeric" | "timestamp" | "int64",
  expected: string,
  label: string,
): void {
  if (value?.sum.oneofKind !== kind) {
    throw new Error(`${label} does not match the bounded Purchase`);
  }
  const sum = value.sum;
  const actual =
    sum.oneofKind === "text"
      ? sum.text
      : sum.oneofKind === "party"
        ? sum.party
        : sum.oneofKind === "numeric"
          ? sum.numeric
          : sum.oneofKind === "timestamp"
            ? sum.timestamp
            : sum.int64;
  if (actual !== expected) {
    throw new Error(`${label} does not match the bounded Purchase`);
  }
}

function micros(value: string): string {
  return (BigInt(Date.parse(value)) * 1000n).toString();
}

function contractIds(
  value: Value | undefined,
  expected: readonly string[],
): void {
  if (value?.sum.oneofKind !== "list") {
    throw new Error("prepared Purchase holdings must be a list");
  }
  const actual = value.sum.list.elements.map((entry) => {
    if (entry.sum.oneofKind !== "contractId") {
      throw new Error("prepared Purchase holding must be a contract ID");
    }
    return entry.sum.contractId;
  });
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("prepared Purchase holdings do not match");
  }
}

function validateChoice(
  exercise: Exercise,
  request: BoundedPurchasePrepareRequest,
): void {
  const expected = request.commands[0]!.ExerciseCommand.choiceArgument;
  const chosen = fields(exercise.chosenValue);
  scalar(chosen.get("attemptId"), "text", expected.attemptId, "attempt ID");
  scalar(
    chosen.get("purchaseCommitment"),
    "text",
    expected.purchaseCommitment,
    "purchase commitment",
  );
  scalar(
    chosen.get("requestCommitment"),
    "text",
    expected.requestCommitment,
    "request commitment",
  );
  scalar(
    chosen.get("challengeId"),
    "text",
    expected.challengeId,
    "challenge ID",
  );
  scalar(
    chosen.get("resourceHash"),
    "text",
    expected.resourceHash,
    "resource hash",
  );
  scalar(chosen.get("recipient"), "party", expected.recipient, "recipient");
  scalar(chosen.get("amount"), "numeric", expected.amount, "amount");
  scalar(
    chosen.get("requestedAt"),
    "timestamp",
    micros(expected.requestedAt),
    "requestedAt",
  );
  scalar(
    chosen.get("executeBefore"),
    "timestamp",
    micros(expected.executeBefore),
    "executeBefore",
  );
  scalar(
    chosen.get("expectedRevision"),
    "int64",
    expected.expectedRevision,
    "capability revision",
  );
  contractIds(chosen.get("inputHoldingCids"), expected.inputHoldingCids);
  if (chosen.get("extraArgs")?.sum.oneofKind !== "record") {
    throw new Error("prepared Purchase extraArgs must be a record");
  }
}

export function validatePreparedPurchaseRoot(
  exercise: Exercise,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): void {
  const [packageId, moduleName, entityName] =
    intent.capability.templateId.split(":");
  const template = exercise.templateId;
  if (template === undefined) {
    throw new Error("prepared root is not the exact bounded Purchase");
  }
  if (
    template.packageId !== packageId ||
    template.moduleName !== moduleName ||
    template.entityName !== entityName ||
    exercise.interfaceId !== undefined ||
    exercise.packageName !== "sotto-control" ||
    exercise.contractId !== intent.capability.contractId ||
    exercise.choiceId !== "Purchase" ||
    !exercise.consuming
  ) {
    throw new Error("prepared root is not the exact bounded Purchase");
  }
  exactParties(exercise.actingParties, intent.actAs, "root acting parties");
  exactParties(
    exercise.signatories,
    [intent.challenge.payerParty],
    "root signatories",
  );
  exactParties(
    exercise.stakeholders,
    [intent.challenge.payerParty, intent.capability.agentParty],
    "root stakeholders",
  );
  if (exercise.choiceObservers.length !== 0) {
    throw new Error("prepared Purchase has unexpected choice observers");
  }
  validateChoice(exercise, request);
}
