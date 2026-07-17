import type { Create } from "@canton-network/core-ledger-proto";
import {
  FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID,
  FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
  type HumanWalletApprovalRequest,
} from "@sotto/x402-canton";
import { validateReferenceHumanWalletContextInputs } from "./reference-human-wallet-context-inputs.js";
import type { ReferenceHumanWalletExternalConfig } from "./reference-human-wallet-config.js";
import {
  readReferenceHumanWalletHolding,
  type ReferenceHumanWalletHolding,
} from "./reference-human-wallet-holdings.js";
import { referenceHumanWalletInput } from "./reference-human-wallet-input-primitives.js";
import type { ReferenceHumanWalletMetadata } from "./reference-human-wallet-metadata.js";
import type { ReferenceHumanWalletTransfer } from "./reference-human-wallet-transfer.js";
import {
  referenceHumanIdentifier,
  referenceHumanParties,
  referenceHumanRecord,
  referenceHumanScalar,
} from "./reference-human-wallet-values.js";

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

export type ReferenceHumanWalletInputs = Readonly<{
  config: ReferenceHumanWalletExternalConfig;
  holdings: ReadonlyMap<string, ReferenceHumanWalletHolding>;
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
  const holdings = new Map(
    transfer.inputHoldingIds.map((contractId) => [
      contractId,
      readReferenceHumanWalletHolding(
        referenceHumanWalletInput(metadata, contractId),
        request,
        [
          FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID,
          approval.selectedPackage.packageId,
        ],
        approval.payerParty,
        "input Holding",
      ),
    ]),
  );
  const context = validateReferenceHumanWalletContextInputs(
    metadata,
    request,
    transfer,
  );
  return Object.freeze({ ...context, holdings });
}
