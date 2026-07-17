import type { Create, Value } from "@canton-network/core-ledger-proto";
import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import {
  validateHumanPreparedExternalConfig,
  type HumanPreparedExternalConfig,
} from "./human-prepared-purchase-config-input.js";
import { validateHumanPreparedFactoryInput } from "./human-prepared-purchase-factory-input.js";
import {
  preparedIdentifier,
  preparedParties,
  preparedRecord,
  preparedScalar,
} from "./prepared-purchase-effect-values.js";

export type HumanPreparedContextInputs = Readonly<{
  configuration: HumanPreparedExternalConfig;
  preapprovalProvider: string;
}>;

function uniqueParties(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function party(value: Value | undefined, label: string): string {
  if (value?.sum.oneofKind !== "party" || value.sum.party === "") {
    throw new Error(`prepared ${label} is not a Party`);
  }
  return value.sum.party;
}

function requireInputIdentity(
  input: Create,
  templateId: string,
  label: string,
): void {
  preparedIdentifier(input.templateId, templateId, label);
  if (input.lfVersion !== "2.1" || input.packageName !== "splice-amulet") {
    throw new Error(`prepared ${label} identity does not match`);
  }
}

function validatePreapproval(
  input: Create,
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): string {
  const templateId = `${intent.packageSelection.packageIds[0]}:Splice.AmuletRules:TransferPreapproval`;
  requireInputIdentity(input, templateId, "human TransferPreapproval input");
  const argument = preparedRecord(
    input.argument,
    ["dso", "receiver", "provider", "validFrom", "lastRenewedAt", "expiresAt"],
    "human TransferPreapproval input",
    templateId,
  );
  preparedScalar(
    argument.get("dso"),
    "party",
    intent.tokenFactory.expectedAdmin,
    "human TransferPreapproval DSO",
  );
  preparedScalar(
    argument.get("receiver"),
    "party",
    intent.challenge.recipientParty,
    "human TransferPreapproval receiver",
  );
  const provider = party(
    argument.get("provider"),
    "human TransferPreapproval provider",
  );
  const timestamp = (field: string): bigint => {
    const value = argument.get(field);
    if (value?.sum.oneofKind !== "timestamp") {
      throw new Error(
        `prepared human TransferPreapproval ${field} is not Time`,
      );
    }
    return BigInt(value.sum.timestamp);
  };
  const validFrom = timestamp("validFrom");
  const renewedAt = timestamp("lastRenewedAt");
  const expiresAt = timestamp("expiresAt");
  if (
    renewedAt < validFrom ||
    expiresAt <= validFrom ||
    expiresAt < BigInt(Date.parse(request.maxRecordTime)) * 1_000n
  ) {
    throw new Error("prepared human TransferPreapproval lifetime is unsafe");
  }
  const authority = uniqueParties([
    intent.tokenFactory.expectedAdmin,
    intent.challenge.recipientParty,
    provider,
  ]);
  preparedParties(
    input.signatories,
    authority,
    "human TransferPreapproval input signatory",
  );
  preparedParties(
    input.stakeholders,
    authority,
    "human TransferPreapproval input stakeholder",
  );
  return provider;
}

function validateFeaturedRight(
  input: Create,
  intent: HumanPurchaseLedgerIntent,
  provider: string,
): void {
  const templateId = `${intent.packageSelection.packageIds[0]}:Splice.Amulet:FeaturedAppRight`;
  requireInputIdentity(input, templateId, "human FeaturedAppRight input");
  const argument = preparedRecord(
    input.argument,
    ["dso", "provider"],
    "human FeaturedAppRight input",
    templateId,
  );
  preparedScalar(
    argument.get("dso"),
    "party",
    intent.tokenFactory.expectedAdmin,
    "human FeaturedAppRight DSO",
  );
  preparedScalar(
    argument.get("provider"),
    "party",
    provider,
    "human FeaturedAppRight provider",
  );
  preparedParties(
    input.signatories,
    [intent.tokenFactory.expectedAdmin],
    "human FeaturedAppRight signatory",
  );
  preparedParties(
    input.stakeholders,
    uniqueParties([intent.tokenFactory.expectedAdmin, provider]),
    "human FeaturedAppRight stakeholder",
  );
}

export function validateHumanPreparedContextInputs(
  inputs: ReadonlyMap<string, Create>,
  contextIds: ReadonlyMap<string, string>,
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): HumanPreparedContextInputs {
  const required = (key: string): Create => {
    const contractId = contextIds.get(key);
    const input = contractId === undefined ? undefined : inputs.get(contractId);
    if (input === undefined)
      throw new Error(`prepared human ${key} input is absent`);
    return input;
  };
  const factory = inputs.get(intent.tokenFactory.contractId);
  if (factory === undefined)
    throw new Error("prepared human TransferFactory input is absent");
  validateHumanPreparedFactoryInput(factory, intent);
  const provider = validatePreapproval(
    required("transfer-preapproval"),
    intent,
    request,
  );
  validateFeaturedRight(required("featured-app-right"), intent, provider);
  return Object.freeze({
    configuration: validateHumanPreparedExternalConfig(
      required("external-party-config-state"),
      intent,
      request,
    ),
    preapprovalProvider: provider,
  });
}
