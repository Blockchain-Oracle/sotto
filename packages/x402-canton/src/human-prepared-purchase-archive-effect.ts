import type { Create, Exercise } from "@canton-network/core-ledger-proto";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import {
  preparedIdentifier,
  preparedParties,
  preparedRecord,
} from "./prepared-purchase-effect-values.js";
import { HOLDING_INTERFACE_ID } from "./purchase-holding-types.js";

export function validateHumanPreparedHoldingArchive(
  exercise: Exercise,
  input: Create,
  intent: HumanPurchaseLedgerIntent,
): void {
  const template = exercise.templateId;
  const inputTemplate = input.templateId;
  if (
    template === undefined ||
    inputTemplate === undefined ||
    template.packageId !== inputTemplate.packageId ||
    template.moduleName !== inputTemplate.moduleName ||
    template.entityName !== inputTemplate.entityName ||
    exercise.packageName !== input.packageName ||
    exercise.choiceId !== "Archive" ||
    !exercise.consuming ||
    exercise.children.length !== 0 ||
    exercise.choiceObservers.length !== 0
  ) {
    throw new Error("prepared human Holding archive identity does not match");
  }
  if (exercise.interfaceId !== undefined) {
    preparedIdentifier(
      exercise.interfaceId,
      HOLDING_INTERFACE_ID,
      "human Holding archive interface",
    );
  }
  const authority = [
    intent.tokenFactory.expectedAdmin,
    intent.challenge.payerParty,
  ];
  preparedParties(
    exercise.actingParties,
    authority,
    "human Holding archive acting",
  );
  preparedParties(
    exercise.signatories,
    authority,
    "human Holding archive signatory",
  );
  preparedParties(
    exercise.stakeholders,
    authority,
    "human Holding archive stakeholder",
  );
  preparedParties(
    exercise.signatories,
    input.signatories,
    "human Holding archive input signatory",
  );
  preparedParties(
    exercise.stakeholders,
    input.stakeholders,
    "human Holding archive input stakeholder",
  );
  preparedRecord(exercise.chosenValue, [], "human Holding archive choice");
  if (exercise.exerciseResult?.sum.oneofKind !== "unit") {
    throw new Error("prepared human Holding archive result is not unit");
  }
}
