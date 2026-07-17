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
import { fixtureScalar } from "../../../packages/x402-canton/test/prepared-purchase-value.fixtures.js";
import { EXTERNAL_PURCHASE_CONTEXT } from "../../../packages/x402-canton/test/transfer-factory-observation.fixtures.js";
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

function config(prepared: HumanPreparedPurchaseFixture): Value {
  const value = humanPreparedInput(
    prepared,
    EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
  ).argument;
  if (value === undefined) throw new Error("test config is absent");
  return value;
}

function replace(
  record: Value,
  label: string,
  kind: "int64" | "numeric" | "timestamp",
  value: string,
): void {
  humanPreparedReplaceField(record, label, fixtureScalar(kind, value));
}

function balance(prepared: HumanPreparedPurchaseFixture, index: number): Value {
  const changes = humanPreparedField(summary(prepared), "balanceChanges");
  if (
    changes.sum.oneofKind !== "genMap" ||
    changes.sum.genMap.entries[index]?.value === undefined
  ) {
    throw new Error("test balance change is absent");
  }
  return changes.sum.genMap.entries[index]!.value!;
}

const mutations: ReadonlyArray<readonly [string, Mutation]> = [
  [
    "summary price",
    (prepared) =>
      replace(summary(prepared), "amuletPrice", "numeric", "2.0000000000"),
  ],
  [
    "transfer round",
    (prepared) =>
      replace(
        humanPreparedField(result(prepared), "round"),
        "number",
        "int64",
        "2",
      ),
  ],
  [
    "payer balance amount",
    (prepared) =>
      replace(
        balance(prepared, 0),
        "changeToInitialAmountAsOfRoundZero",
        "numeric",
        "-0.2490000000",
      ),
  ],
  [
    "provider balance rate",
    (prepared) =>
      replace(
        balance(prepared, 1),
        "changeToHoldingFeesRate",
        "numeric",
        "0.0002000000",
      ),
  ],
  [
    "config price",
    (prepared) =>
      replace(config(prepared), "amuletPrice", "numeric", "2.0000000000"),
  ],
  [
    "config round",
    (prepared) =>
      replace(
        humanPreparedField(config(prepared), "holdingFeesOpenRoundNumber"),
        "number",
        "int64",
        "2",
      ),
  ],
  [
    "config holding fee rate",
    (prepared) =>
      replace(
        humanPreparedField(
          humanPreparedField(config(prepared), "transferConfig"),
          "holdingFee",
        ),
        "rate",
        "numeric",
        "0.0002000000",
      ),
  ],
  [
    "config maximum inputs",
    (prepared) =>
      replace(
        humanPreparedField(config(prepared), "transferConfig"),
        "maxNumInputs",
        "int64",
        "0",
      ),
  ],
  [
    "config maximum outputs",
    (prepared) =>
      replace(
        humanPreparedField(config(prepared), "transferConfig"),
        "maxNumOutputs",
        "int64",
        "0",
      ),
  ],
  [
    "config archive horizon",
    (prepared) =>
      replace(config(prepared), "targetArchiveAfter", "timestamp", "1"),
  ],
  [
    "config reward mode",
    (prepared) => {
      const reward = humanPreparedField(
        config(prepared),
        "rewardCalculationVersion",
      );
      if (
        reward.sum.oneofKind !== "optional" ||
        reward.sum.optional.value?.sum.oneofKind !== "enum"
      ) {
        throw new Error("test reward mode is absent");
      }
      reward.sum.optional.value.sum.enum.constructor =
        "RewardVersion_FeaturedAppMarkers";
    },
  ],
];

describe("reference human wallet accounting configuration", () => {
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
