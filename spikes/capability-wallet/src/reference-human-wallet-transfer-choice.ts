import type { Value } from "@canton-network/core-ledger-proto";
import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import {
  referenceHumanIdentifier,
  referenceHumanRecord,
} from "./reference-human-wallet-values.js";

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

function contractId(value: Value | undefined, label: string): string {
  if (value?.sum.oneofKind !== "contractId" || value.sum.contractId === "") {
    fail(label);
  }
  return value.sum.contractId;
}

function optionalContractId(value: Value | undefined, label: string): string {
  if (
    value?.sum.oneofKind !== "optional" ||
    value.sum.optional.value === undefined
  ) {
    fail(label);
  }
  return contractId(value.sum.optional.value, label);
}

function transferInputIds(
  value: Value | undefined,
  packageId: string,
): readonly string[] {
  if (
    value?.sum.oneofKind !== "list" ||
    value.sum.list.elements.length === 0 ||
    value.sum.list.elements.length > 16
  ) {
    fail("preapproval inputs");
  }
  const result = value.sum.list.elements.map((entry) => {
    if (
      entry.sum.oneofKind !== "variant" ||
      entry.sum.variant.constructor !== "InputAmulet" ||
      entry.sum.variant.value === undefined
    ) {
      fail("preapproval input");
    }
    referenceHumanIdentifier(
      entry.sum.variant.variantId,
      `${packageId}:Splice.AmuletRules:TransferInput`,
      "preapproval input",
    );
    return contractId(entry.sum.variant.value, "preapproval input");
  });
  if (new Set(result).size !== result.length) fail("preapproval inputs");
  return Object.freeze(result);
}

export type ReferenceHumanWalletTransferChoice = Readonly<{
  configContractId: string;
  featuredContractId: string;
  inputHoldingIds: readonly string[];
}>;

export function readReferenceHumanWalletTransferChoice(
  choice: ReadonlyMap<string, Value>,
  request: HumanWalletApprovalRequest,
): ReferenceHumanWalletTransferChoice {
  const packageId = request.approval.selectedPackage.packageId;
  const context = referenceHumanRecord(
    choice.get("context"),
    ["externalPartyConfigState", "featuredAppRight"],
    "preapproval context",
    `${packageId}:Splice.AmuletRules:ExternalPartyTransferContext`,
  );
  const description = choice.get("description");
  if (
    description?.sum.oneofKind !== "optional" ||
    description.sum.optional.value !== undefined
  ) {
    fail("preapproval description");
  }
  return Object.freeze({
    configContractId: contractId(
      context.get("externalPartyConfigState"),
      "configuration context",
    ),
    featuredContractId: optionalContractId(
      context.get("featuredAppRight"),
      "featured context",
    ),
    inputHoldingIds: transferInputIds(choice.get("inputs"), packageId),
  });
}
