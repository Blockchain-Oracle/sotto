import type { Exercise, Value } from "@canton-network/core-ledger-proto";
import {
  FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
  TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
  type HumanWalletApprovalRequest,
} from "@sotto/x402-canton";
import {
  referenceHumanDecimal,
  referenceHumanIdentifier,
  referenceHumanParties,
  referenceHumanRecord,
  referenceHumanScalar,
} from "./reference-human-wallet-values.js";

function fail(): never {
  throw new Error(
    "reference human wallet prepared root identity does not match",
  );
}

function inputHoldingIds(value: Value | undefined): readonly string[] {
  if (
    value?.sum.oneofKind !== "list" ||
    value.sum.list.elements.length === 0 ||
    value.sum.list.elements.length > 16
  ) {
    fail();
  }
  const result = value.sum.list.elements.map((entry) => {
    if (entry.sum.oneofKind !== "contractId" || entry.sum.contractId === "") {
      fail();
    }
    return entry.sum.contractId;
  });
  if (new Set(result).size !== result.length) fail();
  return Object.freeze(result);
}

export type ReferenceHumanWalletRoot = Readonly<{
  inputHoldingIds: readonly string[];
}>;

export function validateReferenceHumanWalletRoot(
  exercise: Exercise,
  request: HumanWalletApprovalRequest,
): ReferenceHumanWalletRoot {
  const approval = request.approval;
  const [, moduleName, entityName] =
    FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID.split(":");
  referenceHumanIdentifier(
    exercise.templateId,
    `${approval.selectedPackage.packageId}:${moduleName}:${entityName}`,
    "root template",
  );
  referenceHumanIdentifier(
    exercise.interfaceId,
    TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
    "root interface",
  );
  if (
    exercise.lfVersion !== "2.1" ||
    exercise.contractId !== approval.tokenFactory.contractId ||
    exercise.packageName !== "splice-amulet" ||
    exercise.choiceId !== "TransferFactory_Transfer" ||
    exercise.consuming ||
    exercise.choiceObservers.length !== 0
  ) {
    fail();
  }
  referenceHumanParties(
    exercise.actingParties,
    [approval.payerParty],
    "root acting",
  );
  referenceHumanParties(
    exercise.signatories,
    [approval.tokenFactory.expectedAdmin],
    "root signatory",
  );
  referenceHumanParties(
    exercise.stakeholders,
    [approval.tokenFactory.expectedAdmin],
    "root stakeholder",
  );
  const interfacePackage = TOKEN_TRANSFER_FACTORY_INTERFACE_ID.split(":")[0]!;
  const choice = referenceHumanRecord(
    exercise.chosenValue,
    ["expectedAdmin", "transfer", "extraArgs"],
    "root choice",
    `${interfacePackage}:Splice.Api.Token.TransferInstructionV1:TransferFactory_Transfer`,
  );
  referenceHumanScalar(
    choice.get("expectedAdmin"),
    "party",
    approval.tokenFactory.expectedAdmin,
    "expected admin",
  );
  const transfer = referenceHumanRecord(
    choice.get("transfer"),
    [
      "sender",
      "receiver",
      "amount",
      "instrumentId",
      "requestedAt",
      "executeBefore",
      "inputHoldingCids",
      "meta",
    ],
    "transfer",
    `${interfacePackage}:Splice.Api.Token.TransferInstructionV1:Transfer`,
  );
  for (const [field, kind, value] of [
    ["sender", "party", approval.payerParty],
    ["receiver", "party", approval.providerParty],
    ["amount", "numeric", referenceHumanDecimal(approval.amountAtomic)],
    [
      "executeBefore",
      "timestamp",
      (BigInt(Date.parse(approval.executeBefore)) * 1_000n).toString(),
    ],
  ] as const) {
    referenceHumanScalar(transfer.get(field), kind, value, `transfer ${field}`);
  }
  const instrument = referenceHumanRecord(
    transfer.get("instrumentId"),
    ["admin", "id"],
    "instrument",
  );
  referenceHumanScalar(
    instrument.get("admin"),
    "party",
    approval.instrument.admin,
    "instrument admin",
  );
  referenceHumanScalar(
    instrument.get("id"),
    "text",
    approval.instrument.id,
    "instrument ID",
  );
  return Object.freeze({
    inputHoldingIds: inputHoldingIds(transfer.get("inputHoldingCids")),
  });
}
