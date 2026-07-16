import type { HumanPurchaseHoldingExecutionMaterial } from "./human-purchase-holding-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import {
  atomicToDamlDecimal,
  sha256Hex,
} from "./purchase-commitment-primitives.js";

type EmptyMetadata = Readonly<{ values: Readonly<Record<string, never>> }>;

export type HumanTransferFactoryChoiceArguments = Readonly<{
  expectedAdmin: string;
  transfer: Readonly<{
    sender: string;
    receiver: string;
    amount: string;
    instrumentId: Readonly<{ admin: string; id: string }>;
    requestedAt: string;
    executeBefore: string;
    inputHoldingCids: readonly string[];
    meta: Readonly<{ values: Readonly<Record<string, string>> }>;
  }>;
  extraArgs: Readonly<{
    context: EmptyMetadata;
    meta: EmptyMetadata;
  }>;
}>;

function emptyMetadata(): EmptyMetadata {
  return Object.freeze({ values: Object.freeze({}) });
}

function purchaseMetadata(intent: HumanPurchaseLedgerIntent) {
  return Object.freeze({
    "sotto-x402/v1/attempt-id": intent.attemptId,
    "sotto-x402/v1/challenge-id": intent.challenge.challengeId,
    "sotto-x402/v1/purchase-commitment": intent.purchaseCommitment,
    "sotto-x402/v1/request-commitment": intent.request.requestCommitment,
  });
}

export function buildHumanTransferFactoryChoiceArguments(
  intent: HumanPurchaseLedgerIntent,
  holdings: HumanPurchaseHoldingExecutionMaterial,
): HumanTransferFactoryChoiceArguments {
  return Object.freeze({
    expectedAdmin: intent.tokenFactory.expectedAdmin,
    transfer: Object.freeze({
      sender: intent.challenge.payerParty,
      receiver: intent.challenge.recipientParty,
      amount: atomicToDamlDecimal(
        intent.challenge.amountAtomic,
        "human transfer amount",
      ),
      instrumentId: Object.freeze({ ...intent.challenge.instrument }),
      requestedAt: intent.challenge.requestedAt,
      executeBefore: intent.challenge.executeBefore,
      inputHoldingCids: Object.freeze([...holdings.contractIds]),
      meta: Object.freeze({ values: purchaseMetadata(intent) }),
    }),
    extraArgs: Object.freeze({
      context: emptyMetadata(),
      meta: emptyMetadata(),
    }),
  });
}

export function digestHumanTransferFactoryChoiceArguments(
  value: HumanTransferFactoryChoiceArguments,
): `sha256:${string}` {
  return `sha256:${sha256Hex(JSON.stringify(value))}`;
}
