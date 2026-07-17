import type { Create } from "@canton-network/core-ledger-proto";
import {
  FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID,
  FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
  type HumanWalletApprovalRequest,
} from "@sotto/x402-canton";
import { validateReferenceHumanWalletContextInputs } from "./reference-human-wallet-context-inputs.js";
import { referenceHumanWalletInput } from "./reference-human-wallet-input-primitives.js";
import type { ReferenceHumanWalletMetadata } from "./reference-human-wallet-metadata.js";
import type { ReferenceHumanWalletTransfer } from "./reference-human-wallet-transfer.js";
import {
  referenceHumanIdentifier,
  referenceHumanParties,
  referenceHumanRecord,
  referenceHumanScalar,
} from "./reference-human-wallet-values.js";

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

function validateFactory(
  candidate: Create,
  request: HumanWalletApprovalRequest,
): void {
  const approval = request.approval;
  referenceHumanIdentifier(
    candidate.templateId,
    FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
    "factory input",
  );
  const argument = referenceHumanRecord(
    candidate.argument,
    ["dso"],
    "factory input",
    `${approval.selectedPackage.packageId}:Splice.ExternalPartyAmuletRules:ExternalPartyAmuletRules`,
  );
  referenceHumanScalar(
    argument.get("dso"),
    "party",
    approval.tokenFactory.expectedAdmin,
    "factory DSO",
  );
  referenceHumanParties(
    candidate.signatories,
    [approval.tokenFactory.expectedAdmin],
    "factory signatory",
  );
  referenceHumanParties(
    candidate.stakeholders,
    [approval.tokenFactory.expectedAdmin],
    "factory stakeholder",
  );
}

function validateHolding(
  candidate: Create,
  request: HumanWalletApprovalRequest,
): string {
  const approval = request.approval;
  referenceHumanIdentifier(
    candidate.templateId,
    `${FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID}:Splice.Amulet:Amulet`,
    "input Holding",
  );
  const argument = referenceHumanRecord(
    candidate.argument,
    ["dso", "owner", "amount"],
    "input Holding",
    `${approval.selectedPackage.packageId}:Splice.Amulet:Amulet`,
  );
  referenceHumanScalar(
    argument.get("dso"),
    "party",
    approval.tokenFactory.expectedAdmin,
    "input Holding DSO",
  );
  referenceHumanScalar(
    argument.get("owner"),
    "party",
    approval.payerParty,
    "input Holding owner",
  );
  const authority = [approval.tokenFactory.expectedAdmin, approval.payerParty];
  referenceHumanParties(
    candidate.signatories,
    authority,
    "input Holding signatory",
  );
  referenceHumanParties(
    candidate.stakeholders,
    authority,
    "input Holding stakeholder",
  );
  const amount = referenceHumanRecord(
    argument.get("amount"),
    ["initialAmount", "createdAt", "ratePerRound"],
    "input Holding amount",
    `${approval.selectedPackage.packageId}:Splice.Fees:ExpiringAmount`,
  );
  const initial = amount.get("initialAmount");
  if (initial?.sum.oneofKind !== "numeric" || initial.sum.numeric === "") {
    fail("input Holding amount");
  }
  return initial.sum.numeric;
}

export type ReferenceHumanWalletInputs = Readonly<{
  holdingAmounts: ReadonlyMap<string, string>;
}>;

export function validateReferenceHumanWalletInputs(
  metadata: ReferenceHumanWalletMetadata,
  request: HumanWalletApprovalRequest,
  transfer: ReferenceHumanWalletTransfer,
): ReferenceHumanWalletInputs {
  const approval = request.approval;
  validateFactory(
    referenceHumanWalletInput(metadata, approval.tokenFactory.contractId),
    request,
  );
  const holdingAmounts = new Map(
    transfer.inputHoldingIds.map((contractId) => [
      contractId,
      validateHolding(referenceHumanWalletInput(metadata, contractId), request),
    ]),
  );
  validateReferenceHumanWalletContextInputs(metadata, request, transfer);
  return Object.freeze({ holdingAmounts });
}
