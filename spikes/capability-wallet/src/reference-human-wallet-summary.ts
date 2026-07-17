import type { Value } from "@canton-network/core-ledger-proto";
import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import {
  readReferenceHumanWalletBalanceChanges,
  type ReferenceHumanWalletBalanceChange,
} from "./reference-human-wallet-balance-changes.js";
import { referenceHumanWalletNonnegativeAtomic } from "./reference-human-wallet-numbers.js";
import { referenceHumanRecord } from "./reference-human-wallet-values.js";

export type ReferenceHumanWalletTransferSummary = Readonly<{
  amuletPriceAtomic: bigint;
  balanceChanges: ReadonlyMap<string, ReferenceHumanWalletBalanceChange>;
  holdingFeesAtomic: bigint;
  inputAtomic: bigint;
  outputFeesAtomic: readonly bigint[];
  senderChangeAtomic: bigint;
  senderChangeFeeAtomic: bigint;
}>;

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

function zero(value: Value | undefined, label: string): void {
  if (referenceHumanWalletNonnegativeAtomic(value, label) !== 0n) fail(label);
}

function optionalZero(value: Value | undefined, label: string): void {
  if (
    value?.sum.oneofKind !== "optional" ||
    value.sum.optional.value === undefined
  ) {
    fail(label);
  }
  zero(value.sum.optional.value, label);
}

function outputFees(value: Value | undefined): readonly bigint[] {
  if (value?.sum.oneofKind !== "list" || value.sum.list.elements.length !== 1) {
    fail("output fees");
  }
  return Object.freeze(
    value.sum.list.elements.map((entry) =>
      referenceHumanWalletNonnegativeAtomic(entry, "output fee"),
    ),
  );
}

export function readReferenceHumanWalletTransferSummary(
  value: Value | undefined,
  request: HumanWalletApprovalRequest,
): ReferenceHumanWalletTransferSummary {
  const packageId = request.approval.selectedPackage.packageId;
  const fields = referenceHumanRecord(
    value,
    [
      "inputAppRewardAmount",
      "inputValidatorRewardAmount",
      "inputSvRewardAmount",
      "inputAmuletAmount",
      "balanceChanges",
      "holdingFees",
      "outputFees",
      "senderChangeFee",
      "senderChangeAmount",
      "amuletPrice",
      "inputValidatorFaucetAmount",
      "inputUnclaimedActivityRecordAmount",
      "inputDevelopmentFundAmount",
    ],
    "transfer summary",
    `${packageId}:Splice.AmuletRules:TransferSummary`,
  );
  for (const label of [
    "inputAppRewardAmount",
    "inputValidatorRewardAmount",
    "inputSvRewardAmount",
  ]) {
    zero(fields.get(label), label);
  }
  optionalZero(fields.get("inputValidatorFaucetAmount"), "validator faucet");
  optionalZero(
    fields.get("inputUnclaimedActivityRecordAmount"),
    "unclaimed activity",
  );
  optionalZero(fields.get("inputDevelopmentFundAmount"), "development fund");
  const amuletPriceAtomic = referenceHumanWalletNonnegativeAtomic(
    fields.get("amuletPrice"),
    "Amulet price",
  );
  if (amuletPriceAtomic === 0n) fail("Amulet price");
  return Object.freeze({
    amuletPriceAtomic,
    balanceChanges: readReferenceHumanWalletBalanceChanges(
      fields.get("balanceChanges"),
      request,
    ),
    holdingFeesAtomic: referenceHumanWalletNonnegativeAtomic(
      fields.get("holdingFees"),
      "holding fees",
    ),
    inputAtomic: referenceHumanWalletNonnegativeAtomic(
      fields.get("inputAmuletAmount"),
      "input amount",
    ),
    outputFeesAtomic: outputFees(fields.get("outputFees")),
    senderChangeAtomic: referenceHumanWalletNonnegativeAtomic(
      fields.get("senderChangeAmount"),
      "sender change amount",
    ),
    senderChangeFeeAtomic: referenceHumanWalletNonnegativeAtomic(
      fields.get("senderChangeFee"),
      "sender change fee",
    ),
  });
}
