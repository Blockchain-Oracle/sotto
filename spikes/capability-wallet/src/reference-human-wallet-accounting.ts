import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import type { ReferenceHumanWalletExternalConfig } from "./reference-human-wallet-config.js";
import type {
  ReferenceHumanWalletHolding,
  ReferenceHumanWalletHoldingEffects,
} from "./reference-human-wallet-holdings.js";
import { referenceHumanWalletScale } from "./reference-human-wallet-numbers.js";
import type { ReferenceHumanWalletTransfer } from "./reference-human-wallet-transfer.js";

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

function sum(
  values: readonly ReferenceHumanWalletHolding[],
  field: "initialAtomic" | "rateAtomic" | "roundZeroAtomic",
): bigint {
  return values.reduce((total, value) => total + value[field], 0n);
}

function roundedPositiveDivision(
  numerator: bigint,
  denominator: bigint,
): bigint {
  const quotient = numerator / denominator;
  return (numerator % denominator) * 2n >= denominator
    ? quotient + 1n
    : quotient;
}

function scaledHoldingFee(config: ReferenceHumanWalletExternalConfig): bigint {
  const scale = referenceHumanWalletScale();
  const reciprocal = roundedPositiveDivision(
    scale * scale,
    config.amuletPriceAtomic,
  );
  return roundedPositiveDivision(reciprocal * config.holdingFeeAtomic, scale);
}

function validateBalanceChanges(
  holdings: ReferenceHumanWalletHoldingEffects,
  transfer: ReferenceHumanWalletTransfer,
  request: HumanWalletApprovalRequest,
): void {
  const expected = new Map([
    [
      request.approval.payerParty,
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
      request.approval.providerParty,
      {
        initialAtomic: sum(holdings.receiver, "roundZeroAtomic"),
        rateAtomic: sum(holdings.receiver, "rateAtomic"),
      },
    ],
  ]);
  for (const [party, value] of expected) {
    const actual = transfer.summary.balanceChanges.get(party);
    if (
      actual?.initialAtomic !== value.initialAtomic ||
      actual.rateAtomic !== value.rateAtomic
    ) {
      fail("balance changes");
    }
  }
}

export function validateReferenceHumanWalletAccounting(
  holdings: ReferenceHumanWalletHoldingEffects,
  transfer: ReferenceHumanWalletTransfer,
  config: ReferenceHumanWalletExternalConfig,
  request: HumanWalletApprovalRequest,
): void {
  const expectedRate = scaledHoldingFee(config);
  if (
    holdings.receiver.length !== 1 ||
    holdings.change.length > 1 ||
    [...holdings.receiver, ...holdings.change].some(
      ({ round }) => round !== transfer.round || round !== config.round,
    ) ||
    [...holdings.receiver, ...holdings.change].some(
      ({ rateAtomic }) => rateAtomic !== expectedRate,
    )
  ) {
    fail("Holding output shape");
  }
  const principal = BigInt(request.approval.amountAtomic);
  const input = sum(holdings.input, "initialAtomic");
  const receiver = sum(holdings.receiver, "initialAtomic");
  const change = sum(holdings.change, "initialAtomic");
  const debit = input - change;
  const fee = debit - principal;
  const summary = transfer.summary;
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
    debit > BigInt(request.approval.maximumTotalDebitAtomic) ||
    fee < 0n ||
    fee > BigInt(request.approval.maximumFeeAtomic) ||
    componentFees !== fee
  ) {
    fail("Holding accounting");
  }
  if (
    summary.holdingFeesAtomic !== 0n ||
    summary.senderChangeFeeAtomic !== 0n ||
    summary.outputFeesAtomic.some((value) => value !== 0n)
  ) {
    fail("external transfer fees");
  }
  validateBalanceChanges(holdings, transfer, request);
}
