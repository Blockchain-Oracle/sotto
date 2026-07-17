import type { Create, Value } from "@canton-network/core-ledger-proto";
import {
  FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID,
  type HumanWalletApprovalRequest,
} from "@sotto/x402-canton";
import type { ReferenceHumanWalletMetadata } from "./reference-human-wallet-metadata.js";

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

export function referenceHumanWalletInput(
  metadata: ReferenceHumanWalletMetadata,
  contractId: string,
): Create {
  const result = metadata.inputs.get(contractId);
  if (result === undefined) fail("required input");
  return result;
}

export function referenceHumanWalletSelectedTemplate(
  candidate: Create,
  request: HumanWalletApprovalRequest,
  moduleName: string,
  entityName: string,
  label: string,
): void {
  const source = candidate.templateId;
  if (
    source === undefined ||
    ![
      request.approval.selectedPackage.packageId,
      FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID,
    ].includes(source.packageId) ||
    source.moduleName !== moduleName ||
    source.entityName !== entityName
  ) {
    fail(label);
  }
}

export function referenceHumanWalletInputParty(
  value: Value | undefined,
  label: string,
): string {
  if (value?.sum.oneofKind !== "party" || value.sum.party === "") fail(label);
  return value.sum.party;
}

export function referenceHumanWalletInputTimestamp(
  value: Value | undefined,
  label: string,
): bigint {
  if (
    value?.sum.oneofKind !== "timestamp" ||
    !/^(?:0|[1-9][0-9]{0,18})$/u.test(value.sum.timestamp)
  ) {
    fail(label);
  }
  return BigInt(value.sum.timestamp);
}
