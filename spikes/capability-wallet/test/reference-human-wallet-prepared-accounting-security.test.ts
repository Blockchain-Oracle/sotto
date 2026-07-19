import type { Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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
import {
  fixtureContractIds,
  fixtureScalar,
} from "../../../packages/x402-canton/test/prepared-purchase-value.fixtures.js";
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

function replaceReceiverResults(
  prepared: HumanPreparedPurchaseFixture,
  contractId: string,
): void {
  const output = humanPreparedField(
    humanPreparedExercise(prepared, "0").exerciseResult,
    "output",
  );
  if (
    output.sum.oneofKind !== "variant" ||
    output.sum.variant.value === undefined
  ) {
    throw new Error("test factory output is absent");
  }
  humanPreparedReplaceField(
    output.sum.variant.value,
    "receiverHoldingCids",
    fixtureContractIds([contractId]),
  );
  const created = humanPreparedField(result(prepared), "createdAmulets");
  if (
    created.sum.oneofKind !== "list" ||
    created.sum.list.elements[0]?.sum.oneofKind !== "variant" ||
    created.sum.list.elements[0].sum.variant.value === undefined
  ) {
    throw new Error("test created Holding result is absent");
  }
  created.sum.list.elements[0].sum.variant.value = fixtureScalar(
    "contractId",
    contractId,
  );
}

async function expectRejected(mutate: Mutation): Promise<void> {
  const input = await referenceHumanWalletInputs();
  const bytes = humanPreparedPurchaseBytes(input.intent, input.request, mutate);
  const request = referenceHumanWalletApprovalRequest(bytes, input.approval);
  expect(() => verifyReferenceHumanWalletPreparedApproval(request)).toThrow(
    /reference human wallet prepared/iu,
  );
}

describe("reference human wallet accounting security", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each([
    "-0.0000000000",
    "0.0000000000",
    "00.1000000000",
    `${"1".repeat(29)}.0`,
  ])("rejects the input Holding amount %s", async (replacement) => {
    await expectRejected((prepared) => {
      const amount = humanPreparedField(
        humanPreparedInput(prepared, "00holding-a").argument,
        "amount",
      );
      humanPreparedReplaceField(
        amount,
        "initialAmount",
        fixtureScalar("numeric", replacement),
      );
    });
  });

  it.each(["00missing-output", "00holding-a", "00effect-change-holding"])(
    "rejects the receiver result CID %s",
    async (contractId) =>
      expectRejected((prepared) =>
        replaceReceiverResults(prepared, contractId),
      ),
  );

  it("rejects a sender-change summary mismatch", async () => {
    await expectRejected((prepared) =>
      humanPreparedReplaceField(
        summary(prepared),
        "senderChangeAmount",
        fixtureScalar("numeric", "0.0740000000"),
      ),
    );
  });

  it("rejects a second output fee", async () => {
    await expectRejected((prepared) => {
      const fees = humanPreparedField(summary(prepared), "outputFees");
      if (fees.sum.oneofKind !== "list")
        throw new Error("test fees are absent");
      fees.sum.list.elements.push(fixtureScalar("numeric", "0.0000000000"));
    });
  });

  it("rejects an extra balance-change party", async () => {
    await expectRejected((prepared) => {
      const changes = humanPreparedField(summary(prepared), "balanceChanges");
      if (changes.sum.oneofKind !== "genMap") {
        throw new Error("test balance changes are absent");
      }
      const copied = structuredClone(changes.sum.genMap.entries[0]!);
      copied.key = fixtureScalar("party", "other-party::1220other");
      changes.sum.genMap.entries.push(copied);
    });
  });

  it("rejects a nonzero input reward", async () => {
    await expectRejected((prepared) =>
      humanPreparedReplaceField(
        summary(prepared),
        "inputAppRewardAmount",
        fixtureScalar("numeric", "0.0000000001"),
      ),
    );
  });
});
