import type { Create } from "@canton-network/core-ledger-proto";
import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import { preparedIdentifier } from "./prepared-purchase-effect-values.js";

export function validateHumanDisclosedInputIdentity(
  input: Create,
  request: HumanPurchasePrepareRequest,
  expectedModule: string,
  expectedEntity: string,
  label: string,
): string {
  const matches = request.disclosedContracts.filter(
    ({ contractId }) => contractId === input.contractId,
  );
  const sourceTemplateId = matches[0]?.templateId;
  const [packageId, moduleName, entityName] =
    sourceTemplateId?.split(":") ?? [];
  if (
    matches.length !== 1 ||
    sourceTemplateId === undefined ||
    !packageId ||
    moduleName !== expectedModule ||
    entityName !== expectedEntity ||
    input.lfVersion !== "2.1" ||
    input.packageName !== "splice-amulet"
  ) {
    throw new Error(`prepared ${label} identity does not match`);
  }
  preparedIdentifier(input.templateId, sourceTemplateId, label);
  return packageId;
}
