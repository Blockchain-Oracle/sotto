import type { Exercise } from "@canton-network/core-ledger-proto";
import {
  preparedContractIds,
  preparedIdentifier,
  preparedRecord,
} from "./prepared-purchase-effect-values.js";
import { preparedEmptyMetadata } from "./prepared-purchase-metadata-values.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

export type PreparedFactoryResult = Readonly<{
  receiverHoldingCids: readonly string[];
  senderChangeCids: readonly string[];
}>;

export function validatePreparedFactoryResult(
  exercise: Exercise,
  intent: BoundedPurchaseLedgerIntent,
): PreparedFactoryResult {
  const packageId = intent.tokenFactory.interfaceId.split(":")[0]!;
  const result = preparedRecord(
    exercise.exerciseResult,
    ["output", "senderChangeCids", "meta"],
    "TransferFactory result",
    `${packageId}:Splice.Api.Token.TransferInstructionV1:TransferInstructionResult`,
  );
  const output = result.get("output");
  if (
    output?.sum.oneofKind !== "variant" ||
    output.sum.variant.constructor !== "TransferInstructionResult_Completed"
  ) {
    throw new Error("prepared TransferFactory effect result is not Completed");
  }
  preparedIdentifier(
    output.sum.variant.variantId,
    `${packageId}:Splice.Api.Token.TransferInstructionV1:TransferInstructionResult_Output`,
    "TransferFactory result variant",
  );
  const completed = preparedRecord(
    output.sum.variant.value,
    ["receiverHoldingCids"],
    "TransferFactory Completed result",
    `${packageId}:Splice.Api.Token.TransferInstructionV1:TransferInstructionResult_Output.TransferInstructionResult_Completed`,
  );
  const receiverHoldingCids = preparedContractIds(
    completed.get("receiverHoldingCids"),
    "TransferFactory receiver holdings",
  );
  if (receiverHoldingCids.length === 0) {
    throw new Error("prepared TransferFactory effect has no receiver holding");
  }
  const senderChangeCids = preparedContractIds(
    result.get("senderChangeCids"),
    "TransferFactory sender change",
  );
  preparedEmptyMetadata(result.get("meta"), "TransferFactory result metadata");
  return Object.freeze({
    receiverHoldingCids: Object.freeze(receiverHoldingCids),
    senderChangeCids: Object.freeze(senderChangeCids),
  });
}
