import type { Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureScalar } from "./prepared-purchase-value.fixtures.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import { EXTERNAL_PURCHASE_CONTEXT } from "./transfer-factory-observation.fixtures.js";
import {
  humanPreparedField,
  humanPreparedInput,
  humanPreparedReplaceField,
  inspectHumanPreparedMutation,
} from "./human-prepared-purchase-effect-test-support.js";

function configField(
  prepared: Parameters<typeof humanPreparedInput>[0],
  label: string,
): Value {
  return humanPreparedField(
    humanPreparedInput(
      prepared,
      EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
    ).argument,
    label,
  );
}

describe("human prepared external configuration effects", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each([
    [
      "price",
      (prepared: Parameters<typeof humanPreparedInput>[0]) =>
        humanPreparedReplaceField(
          humanPreparedInput(
            prepared,
            EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
          ).argument,
          "amuletPrice",
          fixtureScalar("numeric", "2.0000000000"),
        ),
    ],
    [
      "round",
      (prepared: Parameters<typeof humanPreparedInput>[0]) =>
        humanPreparedReplaceField(
          configField(prepared, "holdingFeesOpenRoundNumber"),
          "number",
          fixtureScalar("int64", "2"),
        ),
    ],
    [
      "holding fee rate",
      (prepared: Parameters<typeof humanPreparedInput>[0]) =>
        humanPreparedReplaceField(
          humanPreparedField(
            configField(prepared, "transferConfig"),
            "holdingFee",
          ),
          "rate",
          fixtureScalar("numeric", "0.0002000000"),
        ),
    ],
    [
      "archive horizon",
      (prepared: Parameters<typeof humanPreparedInput>[0]) =>
        humanPreparedReplaceField(
          humanPreparedInput(
            prepared,
            EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
          ).argument,
          "targetArchiveAfter",
          fixtureScalar("timestamp", "1"),
        ),
    ],
  ] as const)("rejects a changed authenticated %s", async (_name, mutate) => {
    await expect(inspectHumanPreparedMutation(mutate)).rejects.toThrow(
      /prepared/iu,
    );
  });

  it("rejects a reward mode that requires an unverified marker effect", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        const reward = configField(prepared, "rewardCalculationVersion");
        if (
          reward.sum.oneofKind !== "optional" ||
          reward.sum.optional.value?.sum.oneofKind !== "enum"
        ) {
          throw new Error("test reward version is absent");
        }
        reward.sum.optional.value.sum.enum.constructor =
          "RewardVersion_FeaturedAppMarkers";
      }),
    ).rejects.toThrow(/prepared/iu);
  });
});
