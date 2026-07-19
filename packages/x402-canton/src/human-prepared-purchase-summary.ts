import type { Value } from "@canton-network/core-ledger-proto";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import {
  preparedNumeric,
  preparedRecord,
  preparedScalar,
} from "./prepared-purchase-effect-values.js";

const SIGNED_DECIMAL = /^(-?)(?:0|[1-9]\d{0,27})(?:\.(\d{1,10}))?$/u;
const SCALE = 10_000_000_000n;

export type HumanPreparedBalanceChange = Readonly<{
  initialAtomic: bigint;
  rateAtomic: bigint;
}>;

export type HumanPreparedTransferSummary = Readonly<{
  amuletPriceAtomic: bigint;
  balanceChanges: ReadonlyMap<string, HumanPreparedBalanceChange>;
  holdingFeesAtomic: bigint;
  inputAtomic: bigint;
  outputFeesAtomic: readonly bigint[];
  senderChangeAtomic: bigint;
  senderChangeFeeAtomic: bigint;
}>;

function signedAtomic(value: Value | undefined, label: string): bigint {
  const decimal = preparedNumeric(value, label);
  const match = SIGNED_DECIMAL.exec(decimal);
  if (match === null) {
    throw new Error(`prepared ${label} effect is not a canonical Decimal`);
  }
  const unsigned = decimal.startsWith("-") ? decimal.slice(1) : decimal;
  const [whole, fraction = ""] = unsigned.split(".");
  const atomic = BigInt(whole!) * SCALE + BigInt(fraction.padEnd(10, "0"));
  if (atomic.toString().length > 38) {
    throw new Error(`prepared ${label} effect exceeds the atomic range`);
  }
  if (match[1] === "-" && atomic === 0n) {
    throw new Error(`prepared ${label} effect is negative zero`);
  }
  return match[1] === "-" ? -atomic : atomic;
}

function nonnegativeAtomic(value: Value | undefined, label: string): bigint {
  const result = signedAtomic(value, label);
  if (result < 0n) throw new Error(`prepared ${label} effect is negative`);
  return result;
}

function optionalZero(value: Value | undefined, label: string): void {
  if (
    value?.sum.oneofKind !== "optional" ||
    value.sum.optional.value === undefined ||
    nonnegativeAtomic(value.sum.optional.value, label) !== 0n
  ) {
    throw new Error(`prepared ${label} effect must contain zero`);
  }
}

function balanceChanges(
  value: Value | undefined,
  intent: HumanPurchaseLedgerIntent,
  packageId: string,
): ReadonlyMap<string, HumanPreparedBalanceChange> {
  if (value?.sum.oneofKind !== "genMap") {
    throw new Error("prepared human balance changes must be a map");
  }
  const result = new Map<string, HumanPreparedBalanceChange>();
  for (const entry of value.sum.genMap.entries) {
    if (
      entry.key?.sum.oneofKind !== "party" ||
      result.has(entry.key.sum.party)
    ) {
      throw new Error("prepared human balance change parties are invalid");
    }
    const change = preparedRecord(
      entry.value,
      ["changeToInitialAmountAsOfRoundZero", "changeToHoldingFeesRate"],
      "human balance change",
      `${packageId}:Splice.AmuletRules:BalanceChange`,
    );
    result.set(
      entry.key.sum.party,
      Object.freeze({
        initialAtomic: signedAtomic(
          change.get("changeToInitialAmountAsOfRoundZero"),
          "human balance change amount",
        ),
        rateAtomic: signedAtomic(
          change.get("changeToHoldingFeesRate"),
          "human balance change rate",
        ),
      }),
    );
  }
  const expected = new Set([
    intent.challenge.payerParty,
    intent.challenge.recipientParty,
  ]);
  if (
    result.size !== expected.size ||
    [...result.keys()].some((key) => !expected.has(key))
  ) {
    throw new Error("prepared human balance change parties do not match");
  }
  return result;
}

function outputFees(value: Value | undefined): readonly bigint[] {
  if (value?.sum.oneofKind !== "list" || value.sum.list.elements.length !== 1) {
    throw new Error("prepared human output fee effects do not match");
  }
  return Object.freeze(
    value.sum.list.elements.map((entry) =>
      nonnegativeAtomic(entry, "human output fee"),
    ),
  );
}

export function validateHumanPreparedTransferSummary(
  value: Value | undefined,
  intent: HumanPurchaseLedgerIntent,
): HumanPreparedTransferSummary {
  const packageId = intent.packageSelection.packageIds[0];
  const summary = preparedRecord(
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
    "human TransferSummary",
    `${packageId}:Splice.AmuletRules:TransferSummary`,
  );
  for (const field of [
    "inputAppRewardAmount",
    "inputValidatorRewardAmount",
    "inputSvRewardAmount",
  ]) {
    preparedScalar(summary.get(field), "numeric", "0.0000000000", field);
  }
  optionalZero(summary.get("inputValidatorFaucetAmount"), "validator faucet");
  optionalZero(
    summary.get("inputUnclaimedActivityRecordAmount"),
    "unclaimed activity",
  );
  optionalZero(summary.get("inputDevelopmentFundAmount"), "development fund");
  const amuletPriceAtomic = nonnegativeAtomic(
    summary.get("amuletPrice"),
    "human Amulet price",
  );
  if (amuletPriceAtomic <= 0n) {
    throw new Error("prepared human Amulet price must be positive");
  }
  return Object.freeze({
    amuletPriceAtomic,
    balanceChanges: balanceChanges(
      summary.get("balanceChanges"),
      intent,
      packageId,
    ),
    holdingFeesAtomic: nonnegativeAtomic(
      summary.get("holdingFees"),
      "human holding fees",
    ),
    inputAtomic: nonnegativeAtomic(
      summary.get("inputAmuletAmount"),
      "human input amount",
    ),
    outputFeesAtomic: outputFees(summary.get("outputFees")),
    senderChangeAtomic: nonnegativeAtomic(
      summary.get("senderChangeAmount"),
      "human sender change",
    ),
    senderChangeFeeAtomic: nonnegativeAtomic(
      summary.get("senderChangeFee"),
      "human sender change fee",
    ),
  });
}
