import type { Create } from "@canton-network/core-ledger-proto";
import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import {
  validateReferenceHumanWalletExternalConfig,
  type ReferenceHumanWalletExternalConfig,
} from "./reference-human-wallet-config.js";
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

const FIVE_NORTH_FEATURED_APP_RIGHT_SOURCE_PACKAGE_ID =
  "3ca1343ab26b453d38c8adb70dca5f1ead8440c42b59b68f070786955cbf9ec1";

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
    [FIVE_NORTH_FEATURED_APP_RIGHT_SOURCE_PACKAGE_ID],
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
): Readonly<{
  config: ReferenceHumanWalletExternalConfig;
  preapprovalParties: readonly string[];
}> {
  const preapproval = validateReferenceHumanWalletPreapprovalInput(
    referenceHumanWalletInput(metadata, transfer.contractId),
    request,
  );
  const config = validateReferenceHumanWalletExternalConfig(
    referenceHumanWalletInput(metadata, transfer.configContractId),
    request,
    transfer.inputHoldingIds.length,
  );
  validateFeatured(
    referenceHumanWalletInput(metadata, transfer.featuredContractId),
    request,
    preapproval.provider,
  );
  return Object.freeze({
    config,
    preapprovalParties: preapproval.parties,
  });
}
