import type { Create } from "@canton-network/core-ledger-proto";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import {
  preparedIdentifier,
  preparedParties,
  preparedRecord,
  preparedScalar,
} from "./prepared-purchase-effect-values.js";

function validateArgumentIdentifier(
  input: Create,
  intent: HumanPurchaseLedgerIntent,
): void {
  const recordId =
    input.argument?.sum.oneofKind === "record"
      ? input.argument.sum.record.recordId
      : undefined;
  const [, moduleName, entityName] =
    intent.tokenFactory.creationTemplateId.split(":");
  const selectedPackageId = intent.packageSelection.packageIds[0];
  if (
    recordId === undefined ||
    !moduleName ||
    !entityName ||
    recordId.packageId !== selectedPackageId ||
    recordId.moduleName !== moduleName ||
    recordId.entityName !== entityName
  ) {
    throw new Error(
      "prepared human metadata TransferFactory effect identifier does not match",
    );
  }
}

export function validateHumanPreparedFactoryInput(
  input: Create,
  intent: HumanPurchaseLedgerIntent,
): void {
  preparedIdentifier(
    input.templateId,
    intent.tokenFactory.creationTemplateId,
    "human metadata TransferFactory template",
  );
  if (input.lfVersion !== "2.1" || input.packageName !== "splice-amulet") {
    throw new Error(
      "prepared human metadata TransferFactory identity does not match",
    );
  }
  validateArgumentIdentifier(input, intent);
  const argument = preparedRecord(
    input.argument,
    ["dso"],
    "human metadata TransferFactory",
  );
  preparedScalar(
    argument.get("dso"),
    "party",
    intent.tokenFactory.expectedAdmin,
    "human metadata TransferFactory DSO",
  );
  preparedParties(
    input.signatories,
    [intent.tokenFactory.expectedAdmin],
    "human metadata TransferFactory signatory",
  );
  preparedParties(
    input.stakeholders,
    [intent.tokenFactory.expectedAdmin],
    "human metadata TransferFactory stakeholder",
  );
}
