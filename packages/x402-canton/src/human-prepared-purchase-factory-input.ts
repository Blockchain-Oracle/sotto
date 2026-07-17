import type { Create } from "@canton-network/core-ledger-proto";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import {
  preparedIdentifier,
  preparedParties,
  preparedRecord,
  preparedScalar,
} from "./prepared-purchase-effect-values.js";

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
  const argument = preparedRecord(
    input.argument,
    ["dso"],
    "human metadata TransferFactory",
    intent.tokenFactory.creationTemplateId,
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
