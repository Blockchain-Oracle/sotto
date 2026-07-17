import type { Exercise, Value } from "@canton-network/core-ledger-proto";
import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import { referenceHumanWalletRound } from "./reference-human-wallet-numbers.js";
import { readReferenceHumanWalletTransferSummary } from "./reference-human-wallet-summary.js";
import {
  referenceHumanIdentifier,
  referenceHumanRecord,
} from "./reference-human-wallet-values.js";

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

function scalar(value: Value | undefined) {
  if (value?.sum.oneofKind !== "contractId") fail("contract ID value");
  return value.sum.contractId;
}

function contractIds(value: Value | undefined, label: string): string[] {
  if (value?.sum.oneofKind !== "list") fail(label);
  const result = value.sum.list.elements.map((entry) => scalar(entry));
  if (result.length === 0 || new Set(result).size !== result.length)
    fail(label);
  return result;
}

function optionalContractId(value: Value | undefined, label: string): string[] {
  if (value?.sum.oneofKind !== "optional") fail(label);
  return value.sum.optional.value === undefined
    ? []
    : [scalar(value.sum.optional.value)];
}

function rootResults(root: Exercise) {
  const interfacePackage = root.interfaceId?.packageId;
  if (interfacePackage === undefined) fail("factory interface");
  const result = referenceHumanRecord(
    root.exerciseResult,
    ["output", "senderChangeCids", "meta"],
    "factory result",
    `${interfacePackage}:Splice.Api.Token.TransferInstructionV1:TransferInstructionResult`,
  );
  const output = result.get("output");
  if (
    output?.sum.oneofKind !== "variant" ||
    output.sum.variant.constructor !== "TransferInstructionResult_Completed" ||
    output.sum.variant.value === undefined
  ) {
    fail("factory completion");
  }
  referenceHumanIdentifier(
    output.sum.variant.variantId,
    `${interfacePackage}:Splice.Api.Token.TransferInstructionV1:TransferInstructionResult_Output`,
    "factory output",
  );
  const completed = referenceHumanRecord(
    output.sum.variant.value,
    ["receiverHoldingCids"],
    "factory completion",
  );
  return Object.freeze({
    receiver: contractIds(completed.get("receiverHoldingCids"), "receiver IDs"),
    change: contractIds(result.get("senderChangeCids"), "change IDs"),
  });
}

function transferResults(
  exercise: Exercise,
  request: HumanWalletApprovalRequest,
) {
  const packageId = request.approval.selectedPackage.packageId;
  const outer = referenceHumanRecord(
    exercise.exerciseResult,
    ["result", "meta"],
    "preapproval result",
    `${packageId}:Splice.AmuletRules:TransferPreapproval_SendV2Result`,
  );
  const transfer = referenceHumanRecord(
    outer.get("result"),
    ["round", "summary", "createdAmulets", "senderChangeAmulet"],
    "transfer result",
    `${packageId}:Splice.AmuletRules:TransferResult`,
  );
  const created = transfer.get("createdAmulets");
  if (
    created?.sum.oneofKind !== "list" ||
    created.sum.list.elements.length !== 1 ||
    created.sum.list.elements[0]?.sum.oneofKind !== "variant" ||
    created.sum.list.elements[0].sum.variant.constructor !==
      "TransferResultAmulet" ||
    created.sum.list.elements[0].sum.variant.value === undefined
  ) {
    fail("created Amulet result");
  }
  return Object.freeze({
    receiver: [scalar(created.sum.list.elements[0].sum.variant.value)],
    change: optionalContractId(
      transfer.get("senderChangeAmulet"),
      "sender change result",
    ),
    round: referenceHumanWalletRound(
      transfer.get("round"),
      packageId,
      "transfer round",
    ),
    summary: readReferenceHumanWalletTransferSummary(
      transfer.get("summary"),
      request,
    ),
  });
}

export function readReferenceHumanWalletTransferResults(
  root: Exercise,
  exercise: Exercise,
  request: HumanWalletApprovalRequest,
) {
  const outer = rootResults(root);
  const inner = transferResults(exercise, request);
  if (
    outer.receiver.length !== 1 ||
    outer.change.length > 1 ||
    JSON.stringify(outer.receiver) !== JSON.stringify(inner.receiver) ||
    JSON.stringify(outer.change) !== JSON.stringify(inner.change)
  ) {
    fail("transfer results");
  }
  return Object.freeze({
    changeIds: outer.change,
    receiverIds: outer.receiver,
    round: inner.round,
    summary: inner.summary,
  });
}
