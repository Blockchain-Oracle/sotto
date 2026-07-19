import type { Create, Exercise } from "@canton-network/core-ledger-proto";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import {
  preparedParties,
  preparedRecord,
} from "./prepared-purchase-effect-values.js";

const ARCHIVE_RECORD_ID =
  "9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69:DA.Internal.Template:Archive";

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
    template.packageId !== intent.packageSelection.packageIds[0] ||
    template.moduleName !== inputTemplate.moduleName ||
    template.entityName !== inputTemplate.entityName ||
    inputTemplate.moduleName !== "Splice.Amulet" ||
    inputTemplate.entityName !== "Amulet" ||
    exercise.packageName !== input.packageName ||
    exercise.interfaceId !== undefined ||
    exercise.choiceId !== "Archive" ||
    !exercise.consuming ||
    exercise.children.length !== 0 ||
    exercise.choiceObservers.length !== 0
  ) {
    throw new Error("prepared human Holding archive identity does not match");
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
  preparedRecord(
    exercise.chosenValue,
    [],
    "human Holding archive choice",
    ARCHIVE_RECORD_ID,
  );
  if (exercise.exerciseResult?.sum.oneofKind !== "unit") {
    throw new Error("prepared human Holding archive result is not unit");
  }
}
