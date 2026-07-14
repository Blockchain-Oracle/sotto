import type { Create } from "@canton-network/core-ledger-proto";
import {
  preparedIdentifier,
  preparedParties,
} from "./prepared-purchase-effect-values.js";

export function validatePreparedSottoCreateIdentity(
  create: Create,
  templateId: string,
  signatory: string,
  stakeholders: readonly string[],
  label: string,
): void {
  preparedIdentifier(create.templateId, templateId, label);
  if (create.packageName !== "sotto-control") {
    throw new Error(`prepared ${label} effect package does not match`);
  }
  preparedParties(create.signatories, [signatory], `${label} signatory`);
  preparedParties(create.stakeholders, stakeholders, `${label} stakeholder`);
}
