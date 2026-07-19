import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import type { HumanPreparedExternalConfig } from "./human-prepared-purchase-config-input.js";
import type { HumanPreparedHoldingEffects } from "./human-prepared-purchase-holding-effects.js";
import type { HumanPreparedHoldingValue } from "./human-prepared-purchase-holding-value.js";
import type { HumanPreparedTransferEffects } from "./human-prepared-purchase-transfer-effects.js";

function sum(
  values: readonly HumanPreparedHoldingValue[],
  field: "initialAtomic" | "rateAtomic" | "roundZeroAtomic",
): bigint {
  return values.reduce((total, value) => total + value[field], 0n);
}

const SCALE = 10_000_000_000n;

function roundedPositiveDivision(
  numerator: bigint,
  denominator: bigint,
): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

function scaledHoldingFee(config: HumanPreparedExternalConfig): bigint {
  const reciprocal = roundedPositiveDivision(
    SCALE * SCALE,
    config.amuletPriceAtomic,
  );
  return roundedPositiveDivision(reciprocal * config.holdingFeeAtomic, SCALE);
}

function validateBalanceChanges(
  holdings: HumanPreparedHoldingEffects,
  transfer: HumanPreparedTransferEffects,
  intent: HumanPurchaseLedgerIntent,
): void {
  const expected = new Map([
    [
      intent.challenge.payerParty,
      {
        initialAtomic:
          sum(holdings.change, "roundZeroAtomic") -
          sum(holdings.input, "roundZeroAtomic"),
        rateAtomic:
          sum(holdings.change, "rateAtomic") -
          sum(holdings.input, "rateAtomic"),
      },
    ],
    [
      intent.challenge.recipientParty,
      {
        initialAtomic: sum(holdings.receiver, "roundZeroAtomic"),
        rateAtomic: sum(holdings.receiver, "rateAtomic"),
      },
    ],
  ]);
  const actual = transfer.transfer.summary.balanceChanges;
  for (const [party, value] of expected) {
    const observed = actual.get(party);
    if (
      observed?.initialAtomic !== value.initialAtomic ||
      observed.rateAtomic !== value.rateAtomic
    ) {
      throw new Error("prepared human balance change effects do not reconcile");
    }
  }
}

export function validateHumanPreparedPurchaseAccounting(
  holdings: HumanPreparedHoldingEffects,
  transfer: HumanPreparedTransferEffects,
  intent: HumanPurchaseLedgerIntent,
  config: HumanPreparedExternalConfig,
): void {
  const expectedRate = scaledHoldingFee(config);
  if (
    holdings.receiver.length !== 1 ||
    holdings.change.length > 1 ||
    [...holdings.receiver, ...holdings.change].some(
      ({ round }) =>
        round !== transfer.transfer.round || round !== config.round,
    ) ||
    [...holdings.receiver, ...holdings.change].some(
      ({ rateAtomic }) => rateAtomic !== expectedRate,
    )
  ) {
    throw new Error("prepared human Holding output shape does not match");
  }
  const principal = BigInt(intent.challenge.amountAtomic);
  const input = sum(holdings.input, "initialAtomic");
  const receiver = sum(holdings.receiver, "initialAtomic");
  const change = sum(holdings.change, "initialAtomic");
  const debit = input - change;
  const fee = debit - principal;
  const summary = transfer.transfer.summary;
  const componentFees =
    summary.holdingFeesAtomic +
    summary.senderChangeFeeAtomic +
    summary.outputFeesAtomic.reduce((total, value) => total + value, 0n);
  if (
    receiver !== principal ||
    summary.amuletPriceAtomic !== config.amuletPriceAtomic ||
    summary.inputAtomic !== input ||
    summary.senderChangeAtomic !== change ||
    debit < principal ||
    debit > BigInt(intent.limits.maximumTotalDebitAtomic) ||
    fee < 0n ||
    fee > BigInt(intent.limits.maximumFeeAtomic) ||
    componentFees !== fee
  ) {
    throw new Error("prepared human Holding accounting effects do not match");
  }
  if (
    summary.holdingFeesAtomic !== 0n ||
    summary.senderChangeFeeAtomic !== 0n ||
    summary.outputFeesAtomic.some((value) => value !== 0n)
  ) {
    throw new Error("prepared human external transfer fees are not zero");
  }
  validateBalanceChanges(holdings, transfer, intent);
}
