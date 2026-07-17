import type { Create } from "@canton-network/core-ledger-proto";
import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import {
  referenceHumanWalletInputParty,
  referenceHumanWalletInputTimestamp,
  referenceHumanWalletSelectedTemplate,
} from "./reference-human-wallet-input-primitives.js";
import {
  referenceHumanParties,
  referenceHumanRecord,
  referenceHumanScalar,
} from "./reference-human-wallet-values.js";

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

export function validateReferenceHumanWalletPreapprovalInput(
  candidate: Create,
  request: HumanWalletApprovalRequest,
): Readonly<{ parties: readonly string[]; provider: string }> {
  const approval = request.approval;
  referenceHumanWalletSelectedTemplate(
    candidate,
    request,
    "Splice.AmuletRules",
    "TransferPreapproval",
    "preapproval input",
  );
  const argument = referenceHumanRecord(
    candidate.argument,
    ["dso", "receiver", "provider", "validFrom", "lastRenewedAt", "expiresAt"],
    "preapproval input",
    `${approval.selectedPackage.packageId}:Splice.AmuletRules:TransferPreapproval`,
  );
  referenceHumanScalar(
    argument.get("dso"),
    "party",
    approval.tokenFactory.expectedAdmin,
    "preapproval DSO",
  );
  referenceHumanScalar(
    argument.get("receiver"),
    "party",
    approval.providerParty,
    "preapproval receiver",
  );
  const provider = referenceHumanWalletInputParty(
    argument.get("provider"),
    "preapproval provider",
  );
  const validFrom = referenceHumanWalletInputTimestamp(
    argument.get("validFrom"),
    "preapproval validFrom",
  );
  const renewed = referenceHumanWalletInputTimestamp(
    argument.get("lastRenewedAt"),
    "preapproval renewed",
  );
  const expires = referenceHumanWalletInputTimestamp(
    argument.get("expiresAt"),
    "preapproval expiry",
  );
  if (
    renewed < validFrom ||
    expires <= validFrom ||
    expires < BigInt(Date.parse(approval.executeBefore)) * 1_000n
  ) {
    fail("preapproval lifetime");
  }
  const authority = [
    approval.tokenFactory.expectedAdmin,
    approval.providerParty,
    provider,
  ];
  referenceHumanParties(
    candidate.signatories,
    authority,
    "preapproval signatory",
  );
  referenceHumanParties(
    candidate.stakeholders,
    authority,
    "preapproval stakeholder",
  );
  return Object.freeze({ parties: Object.freeze(authority), provider });
}
