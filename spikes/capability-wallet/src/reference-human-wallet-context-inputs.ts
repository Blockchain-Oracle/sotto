import type { Create } from "@canton-network/core-ledger-proto";
import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import {
  referenceHumanWalletInput,
  referenceHumanWalletSelectedTemplate,
} from "./reference-human-wallet-input-primitives.js";
import type { ReferenceHumanWalletMetadata } from "./reference-human-wallet-metadata.js";
import { validateReferenceHumanWalletPreapprovalInput } from "./reference-human-wallet-preapproval-input.js";
import type { ReferenceHumanWalletTransfer } from "./reference-human-wallet-transfer.js";
import {
  referenceHumanParties,
  referenceHumanRecord,
  referenceHumanScalar,
} from "./reference-human-wallet-values.js";

function validateConfig(
  candidate: Create,
  request: HumanWalletApprovalRequest,
): void {
  const approval = request.approval;
  referenceHumanWalletSelectedTemplate(
    candidate,
    request,
    "Splice.ExternalPartyConfigState",
    "ExternalPartyConfigState",
    "external config input",
  );
  const argument = referenceHumanRecord(
    candidate.argument,
    [
      "dso",
      "holdingFeesOpenRoundNumber",
      "amuletPrice",
      "transferConfig",
      "targetArchiveAfter",
      "rewardCalculationVersion",
    ],
    "external config input",
    `${approval.selectedPackage.packageId}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
  );
  referenceHumanScalar(
    argument.get("dso"),
    "party",
    approval.tokenFactory.expectedAdmin,
    "external config DSO",
  );
  referenceHumanParties(
    candidate.signatories,
    [approval.tokenFactory.expectedAdmin],
    "external config signatory",
  );
  referenceHumanParties(
    candidate.stakeholders,
    [approval.tokenFactory.expectedAdmin],
    "external config stakeholder",
  );
}

function validateFeatured(
  candidate: Create,
  request: HumanWalletApprovalRequest,
  provider: string,
): void {
  const approval = request.approval;
  referenceHumanWalletSelectedTemplate(
    candidate,
    request,
    "Splice.Amulet",
    "FeaturedAppRight",
    "Featured App input",
  );
  const argument = referenceHumanRecord(
    candidate.argument,
    ["dso", "provider"],
    "Featured App input",
    `${approval.selectedPackage.packageId}:Splice.Amulet:FeaturedAppRight`,
  );
  referenceHumanScalar(
    argument.get("dso"),
    "party",
    approval.tokenFactory.expectedAdmin,
    "Featured App DSO",
  );
  referenceHumanScalar(
    argument.get("provider"),
    "party",
    provider,
    "Featured App provider",
  );
  referenceHumanParties(
    candidate.signatories,
    [approval.tokenFactory.expectedAdmin],
    "Featured App signatory",
  );
  referenceHumanParties(
    candidate.stakeholders,
    [approval.tokenFactory.expectedAdmin, provider],
    "Featured App stakeholder",
  );
}

export function validateReferenceHumanWalletContextInputs(
  metadata: ReferenceHumanWalletMetadata,
  request: HumanWalletApprovalRequest,
  transfer: ReferenceHumanWalletTransfer,
): void {
  const provider = validateReferenceHumanWalletPreapprovalInput(
    referenceHumanWalletInput(metadata, transfer.contractId),
    request,
  );
  validateConfig(
    referenceHumanWalletInput(metadata, transfer.configContractId),
    request,
  );
  validateFeatured(
    referenceHumanWalletInput(metadata, transfer.featuredContractId),
    request,
    provider,
  );
}
