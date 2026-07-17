import type { Exercise, Value } from "@canton-network/core-ledger-proto";
import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import { validateHumanResultMetadata } from "./human-prepared-purchase-metadata-effects.js";
import {
  preparedIdentifier,
  preparedRecord,
} from "./prepared-purchase-effect-values.js";
import type { PreparedFactoryResult } from "./prepared-purchase-factory-result.js";
import {
  validateHumanPreparedTransferSummary,
  type HumanPreparedTransferSummary,
} from "./human-prepared-purchase-summary.js";

export type HumanPreparedTransferResult = Readonly<{
  round: bigint;
  summary: HumanPreparedTransferSummary;
}>;

function optionalValue(
  value: Value | undefined,
  label: string,
): Value | undefined {
  if (value?.sum.oneofKind !== "optional") {
    throw new Error(`prepared ${label} must be optional`);
  }
  return value.sum.optional.value;
}

function contractId(value: Value, label: string): string {
  if (value.sum.oneofKind !== "contractId" || value.sum.contractId === "") {
    throw new Error(`prepared ${label} effect is invalid`);
  }
  return value.sum.contractId;
}

function createdHoldingIds(
  value: Value | undefined,
  packageId: string,
): string[] {
  if (value?.sum.oneofKind !== "list") {
    throw new Error("prepared human created Amulets are absent");
  }
  const result = value.sum.list.elements.map((entry) => {
    if (
      entry.sum.oneofKind !== "variant" ||
      entry.sum.variant.constructor !== "TransferResultAmulet" ||
      entry.sum.variant.value === undefined
    ) {
      throw new Error("prepared human created Amulet is invalid");
    }
    preparedIdentifier(
      entry.sum.variant.variantId,
      `${packageId}:Splice.AmuletRules:CreatedAmulet`,
      "human created Amulet",
    );
    return contractId(entry.sum.variant.value, "human created Amulet");
  });
  if (new Set(result).size !== result.length) {
    throw new Error("prepared human created Amulet IDs repeat");
  }
  return result;
}

function transferRound(value: Value | undefined, packageId: string): bigint {
  const round = preparedRecord(
    value,
    ["number"],
    "human transfer round",
    `${packageId}:Splice.Types:Round`,
  ).get("number");
  if (
    round?.sum.oneofKind !== "int64" ||
    !/^(?:0|[1-9]\d{0,18})$/u.test(round.sum.int64)
  ) {
    throw new Error("prepared human transfer round is invalid");
  }
  return BigInt(round.sum.int64);
}

export function validateHumanFactoryResultMetadata(
  exercise: Exercise,
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): void {
  const packageId = intent.tokenFactory.interfaceId.split(":")[0]!;
  const result = preparedRecord(
    exercise.exerciseResult,
    ["output", "senderChangeCids", "meta"],
    "human TransferFactory result",
    `${packageId}:Splice.Api.Token.TransferInstructionV1:TransferInstructionResult`,
  );
  validateHumanResultMetadata(
    result.get("meta"),
    intent,
    request,
    "human TransferFactory result metadata",
  );
}

export function validateHumanPreapprovalResult(
  exercise: Exercise,
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
  factory: PreparedFactoryResult,
): HumanPreparedTransferResult {
  const packageId = intent.packageSelection.packageIds[0];
  const outer = preparedRecord(
    exercise.exerciseResult,
    ["result", "meta"],
    "human TransferPreapproval result",
    `${packageId}:Splice.AmuletRules:TransferPreapproval_SendV2Result`,
  );
  const transfer = preparedRecord(
    outer.get("result"),
    ["round", "summary", "createdAmulets", "senderChangeAmulet"],
    "human transfer result",
    `${packageId}:Splice.AmuletRules:TransferResult`,
  );
  if (
    JSON.stringify(
      createdHoldingIds(transfer.get("createdAmulets"), packageId),
    ) !== JSON.stringify(factory.receiverHoldingCids)
  ) {
    throw new Error("prepared human receiver results do not match");
  }
  const change = optionalValue(
    transfer.get("senderChangeAmulet"),
    "human sender change",
  );
  const changeIds =
    change === undefined ? [] : [contractId(change, "human sender change")];
  if (JSON.stringify(changeIds) !== JSON.stringify(factory.senderChangeCids)) {
    throw new Error("prepared human sender change result does not match");
  }
  validateHumanResultMetadata(
    outer.get("meta"),
    intent,
    request,
    "human TransferPreapproval result metadata",
  );
  return Object.freeze({
    round: transferRound(transfer.get("round"), packageId),
    summary: validateHumanPreparedTransferSummary(
      transfer.get("summary"),
      intent,
    ),
  });
}
