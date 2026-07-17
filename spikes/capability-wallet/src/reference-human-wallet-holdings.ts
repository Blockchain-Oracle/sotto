import type { Create } from "@canton-network/core-ledger-proto";
import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import {
  referenceHumanDecimal,
  referenceHumanIdentifier,
  referenceHumanParties,
  referenceHumanRecord,
  referenceHumanScalar,
} from "./reference-human-wallet-values.js";

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

export function referenceHumanWalletHoldingOwner(
  create: Create,
  request: HumanWalletApprovalRequest,
): string {
  const approval = request.approval;
  const template = `${approval.selectedPackage.packageId}:Splice.Amulet:Amulet`;
  referenceHumanIdentifier(create.templateId, template, "Holding template");
  if (create.lfVersion !== "2.1" || create.packageName !== "splice-amulet") {
    fail("Holding identity");
  }
  const argument = referenceHumanRecord(
    create.argument,
    ["dso", "owner", "amount"],
    "Holding",
    template,
  );
  referenceHumanScalar(
    argument.get("dso"),
    "party",
    approval.tokenFactory.expectedAdmin,
    "Holding admin",
  );
  const owner = argument.get("owner");
  if (owner?.sum.oneofKind !== "party") fail("Holding owner");
  referenceHumanParties(
    create.signatories,
    [approval.tokenFactory.expectedAdmin, owner.sum.party],
    "Holding signatory",
  );
  referenceHumanParties(
    create.stakeholders,
    [approval.tokenFactory.expectedAdmin, owner.sum.party],
    "Holding stakeholder",
  );
  const amount = referenceHumanRecord(
    argument.get("amount"),
    ["initialAmount", "createdAt", "ratePerRound"],
    "Holding amount",
    `${approval.selectedPackage.packageId}:Splice.Fees:ExpiringAmount`,
  );
  if (owner.sum.party === approval.providerParty) {
    referenceHumanScalar(
      amount.get("initialAmount"),
      "numeric",
      referenceHumanDecimal(approval.amountAtomic),
      "provider amount",
    );
  }
  return owner.sum.party;
}
