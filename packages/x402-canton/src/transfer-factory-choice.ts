import {
  atomicToDamlDecimal,
  sha256Hex,
} from "./purchase-commitment-primitives.js";
import type { PurchaseHoldingExecutionMaterial } from "./purchase-holding-observation.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

export type TransferFactoryChoiceArguments = Readonly<{
  expectedAdmin: string;
  transfer: Readonly<{
    sender: string;
    receiver: string;
    amount: string;
    instrumentId: Readonly<{ admin: string; id: string }>;
    requestedAt: string;
    executeBefore: string;
    inputHoldingCids: readonly string[];
    meta: Readonly<{ values: Readonly<Record<string, never>> }>;
  }>;
  extraArgs: Readonly<{
    context: Readonly<{ values: Readonly<Record<string, never>> }>;
    meta: Readonly<{ values: Readonly<Record<string, never>> }>;
  }>;
}>;

function emptyMetadata() {
  return Object.freeze({ values: Object.freeze({}) });
}

export function buildTransferFactoryChoiceArguments(
  intent: BoundedPurchaseLedgerIntent,
  holdings: PurchaseHoldingExecutionMaterial,
): TransferFactoryChoiceArguments {
  return Object.freeze({
    expectedAdmin: intent.tokenFactory.expectedAdmin,
    transfer: Object.freeze({
      sender: intent.challenge.payerParty,
      receiver: intent.challenge.recipientParty,
      amount: atomicToDamlDecimal(
        intent.challenge.amountAtomic,
        "transfer amount",
      ),
      instrumentId: Object.freeze({ ...intent.challenge.instrument }),
      requestedAt: intent.challenge.requestedAt,
      executeBefore: intent.challenge.executeBefore,
      inputHoldingCids: Object.freeze([...holdings.contractIds]),
      meta: emptyMetadata(),
    }),
    extraArgs: Object.freeze({
      context: emptyMetadata(),
      meta: emptyMetadata(),
    }),
  });
}

export function digestTransferFactoryChoiceArguments(
  value: TransferFactoryChoiceArguments,
): `sha256:${string}` {
  return `sha256:${sha256Hex(JSON.stringify(value))}`;
}
