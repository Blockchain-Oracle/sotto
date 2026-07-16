import type { Value } from "@canton-network/core-ledger-proto";
import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import {
  preparedIdentifier,
  preparedRecord,
  preparedScalar,
} from "./prepared-purchase-effect-values.js";
import type { PreparedFactoryResult } from "./prepared-purchase-factory-result.js";
import { preparedMetadata } from "./prepared-purchase-metadata-values.js";
import type { PreparedPurchaseGraphNode } from "./prepared-purchase-graph-types.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

type ExerciseNode = Extract<PreparedPurchaseGraphNode, { kind: "exercise" }>;

function optionalValue(
  value: Value | undefined,
  label: string,
): Value | undefined {
  if (value?.sum.oneofKind !== "optional") {
    throw new Error(`prepared ${label} must be optional`);
  }
  return value.sum.optional.value;
}

export function validateTransferPreapprovalChoice(
  node: ExerciseNode,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
  packageId: string,
  contextIds: ReadonlyMap<string, string>,
): void {
  const choice = preparedRecord(
    node.exercise.chosenValue,
    ["context", "inputs", "amount", "sender", "description", "meta"],
    "TransferPreapproval choice",
    `${packageId}:Splice.AmuletRules:TransferPreapproval_SendV2`,
  );
  const context = preparedRecord(
    choice.get("context"),
    ["externalPartyConfigState", "featuredAppRight"],
    "TransferPreapproval context",
    `${packageId}:Splice.AmuletRules:ExternalPartyTransferContext`,
  );
  preparedScalar(
    context.get("externalPartyConfigState"),
    "contractId",
    contextIds.get("external-party-config-state") ?? "",
    "TransferPreapproval config state",
  );
  preparedScalar(
    optionalValue(context.get("featuredAppRight"), "featured app right"),
    "contractId",
    contextIds.get("featured-app-right") ?? "",
    "TransferPreapproval featured app right",
  );
  const inputs = choice.get("inputs");
  if (inputs?.sum.oneofKind !== "list") {
    throw new Error("prepared TransferPreapproval inputs must be a list");
  }
  const inputIds = inputs.sum.list.elements.map((input) => {
    if (input.sum.oneofKind !== "variant") {
      throw new Error("prepared TransferPreapproval input is not a variant");
    }
    preparedIdentifier(
      input.sum.variant.variantId,
      `${packageId}:Splice.AmuletRules:TransferInput`,
      "TransferPreapproval input",
    );
    if (
      input.sum.variant.constructor !== "InputAmulet" ||
      input.sum.variant.value?.sum.oneofKind !== "contractId"
    ) {
      throw new Error("prepared TransferPreapproval input does not match");
    }
    return input.sum.variant.value.sum.contractId;
  });
  const expected = request.commands[0]!.ExerciseCommand.choiceArgument;
  if (JSON.stringify(inputIds) !== JSON.stringify(expected.inputHoldingCids)) {
    throw new Error("prepared TransferPreapproval inputs do not match");
  }
  preparedScalar(
    choice.get("amount"),
    "numeric",
    expected.amount,
    "TransferPreapproval amount",
  );
  preparedScalar(
    choice.get("sender"),
    "party",
    intent.challenge.payerParty,
    "TransferPreapproval sender",
  );
  if (
    optionalValue(
      choice.get("description"),
      "TransferPreapproval description",
    ) !== undefined
  ) {
    throw new Error("prepared TransferPreapproval description is not empty");
  }
  const metadata = optionalValue(
    choice.get("meta"),
    "TransferPreapproval metadata",
  );
  if (metadata === undefined) {
    throw new Error("prepared TransferPreapproval metadata is absent");
  }
  preparedMetadata(metadata, "TransferPreapproval metadata");
}

export function validateTransferPreapprovalResult(
  node: ExerciseNode,
  result: PreparedFactoryResult,
  packageId: string,
): void {
  const outer = preparedRecord(
    node.exercise.exerciseResult,
    ["result", "meta"],
    "TransferPreapproval result",
    `${packageId}:Splice.AmuletRules:TransferPreapproval_SendV2Result`,
  );
  const transfer = preparedRecord(
    outer.get("result"),
    ["round", "summary", "createdAmulets", "senderChangeAmulet"],
    "TransferPreapproval transfer result",
    `${packageId}:Splice.AmuletRules:TransferResult`,
  );
  const created = transfer.get("createdAmulets");
  if (created?.sum.oneofKind !== "list") {
    throw new Error("prepared TransferPreapproval created outputs are absent");
  }
  const createdIds = created.sum.list.elements.map((value) => {
    if (
      value.sum.oneofKind !== "variant" ||
      value.sum.variant.constructor !== "TransferResultAmulet" ||
      value.sum.variant.value?.sum.oneofKind !== "contractId"
    ) {
      throw new Error("prepared TransferPreapproval created output is invalid");
    }
    preparedIdentifier(
      value.sum.variant.variantId,
      `${packageId}:Splice.AmuletRules:CreatedAmulet`,
      "TransferPreapproval created output",
    );
    return value.sum.variant.value.sum.contractId;
  });
  if (
    JSON.stringify(createdIds) !== JSON.stringify(result.receiverHoldingCids)
  ) {
    throw new Error(
      "prepared TransferPreapproval receiver outputs do not match",
    );
  }
  const change = optionalValue(
    transfer.get("senderChangeAmulet"),
    "TransferPreapproval sender change",
  );
  const changeIds = change === undefined ? [] : [contractId(change)];
  if (JSON.stringify(changeIds) !== JSON.stringify(result.senderChangeCids)) {
    throw new Error(
      "prepared TransferPreapproval sender change does not match",
    );
  }
  preparedMetadata(outer.get("meta"), "TransferPreapproval result metadata");
}

function contractId(value: Value): string {
  if (value.sum.oneofKind !== "contractId" || value.sum.contractId === "") {
    throw new Error("prepared TransferPreapproval sender change is invalid");
  }
  return value.sum.contractId;
}
