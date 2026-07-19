import type { Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  humanPreparedCreate,
  humanPreparedExercise,
  humanPreparedField,
  humanPreparedInput,
  humanPreparedReplaceField,
} from "../../../packages/x402-canton/test/human-prepared-purchase-effect-test-support.js";
import {
  humanPreparedPurchaseBytes,
  type HumanPreparedPurchaseFixture,
} from "../../../packages/x402-canton/test/human-prepared-purchase.fixtures.js";
import { HUMAN_PURCHASE_NOW } from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";
import { fixtureScalar } from "../../../packages/x402-canton/test/prepared-purchase-value.fixtures.js";
import { verifyReferenceHumanWalletPreparedApproval } from "../src/reference-human-wallet-prepared.js";
import {
  referenceHumanWalletApprovalRequest,
  referenceHumanWalletInputs,
} from "./reference-human-wallet.fixtures.js";

type Mutation = (prepared: HumanPreparedPurchaseFixture) => void;

function result(prepared: HumanPreparedPurchaseFixture): Value {
  return humanPreparedField(
    humanPreparedExercise(prepared, "1").exerciseResult,
    "result",
  );
}

function summary(prepared: HumanPreparedPurchaseFixture): Value {
  return humanPreparedField(result(prepared), "summary");
}

function amount(value: Value, replacement: string): void {
  humanPreparedReplaceField(
    value,
    "initialAmount",
    fixtureScalar("numeric", replacement),
  );
}

function replaceNumeric(
  value: Value,
  label: string,
  replacement: string,
): void {
  humanPreparedReplaceField(
    value,
    label,
    fixtureScalar("numeric", replacement),
  );
}

function firstListValue(value: Value, replacement: Value): void {
  if (value.sum.oneofKind !== "list" || value.sum.list.elements.length !== 1) {
    throw new Error("test list is absent");
  }
  value.sum.list.elements[0] = replacement;
}

const mutations: ReadonlyArray<readonly [string, Mutation]> = [
  [
    "summary input amount",
    (prepared) =>
      replaceNumeric(summary(prepared), "inputAmuletAmount", "0.3240000000"),
  ],
  [
    "holding fee",
    (prepared) =>
      replaceNumeric(summary(prepared), "holdingFees", "0.0010000000"),
  ],
  [
    "output fee",
    (prepared) =>
      firstListValue(
        humanPreparedField(summary(prepared), "outputFees"),
        fixtureScalar("numeric", "0.0010000000"),
      ),
  ],
  [
    "sender change fee",
    (prepared) =>
      replaceNumeric(summary(prepared), "senderChangeFee", "0.0010000000"),
  ],
  [
    "coordinated over-debit",
    (prepared) => {
      amount(
        humanPreparedField(
          humanPreparedInput(prepared, "00holding-a").argument,
          "amount",
        ),
        "0.4000000000",
      );
      replaceNumeric(summary(prepared), "inputAmuletAmount", "0.4000000000");
      replaceNumeric(summary(prepared), "senderChangeAmount", "0.0740000000");
      amount(
        humanPreparedField(
          humanPreparedCreate(prepared, "4").argument,
          "amount",
        ),
        "0.0740000000",
      );
    },
  ],
  [
    "input Holding rate",
    (prepared) => {
      const amountValue = humanPreparedField(
        humanPreparedInput(prepared, "00holding-a").argument,
        "amount",
      );
      replaceNumeric(
        humanPreparedField(amountValue, "ratePerRound"),
        "rate",
        "0.0010000000",
      );
    },
  ],
  [
    "output Holding round",
    (prepared) => {
      const amountValue = humanPreparedField(
        humanPreparedCreate(prepared, "3").argument,
        "amount",
      );
      humanPreparedReplaceField(
        humanPreparedField(amountValue, "createdAt"),
        "number",
        fixtureScalar("int64", "2"),
      );
    },
  ],
  [
    "output Holding rate",
    (prepared) => {
      const amountValue = humanPreparedField(
        humanPreparedCreate(prepared, "3").argument,
        "amount",
      );
      replaceNumeric(
        humanPreparedField(amountValue, "ratePerRound"),
        "rate",
        "0.0002000000",
      );
    },
  ],
];

describe("reference human wallet accounting", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each(mutations)("rejects a changed %s", async (_name, mutate) => {
    const input = await referenceHumanWalletInputs();
    const bytes = humanPreparedPurchaseBytes(
      input.intent,
      input.request,
      mutate,
    );
    const request = referenceHumanWalletApprovalRequest(bytes, input.approval);

    expect(() => verifyReferenceHumanWalletPreparedApproval(request)).toThrow(
      /reference human wallet prepared/iu,
    );
  });
});
