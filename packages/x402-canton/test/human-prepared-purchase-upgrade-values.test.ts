import type { Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  humanPreparedField,
  humanPreparedInput,
  inspectHumanPreparedMutation,
} from "./human-prepared-purchase-effect-test-support.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import { HISTORICAL_HOLDING_TEMPLATE_ID } from "./prepared-purchase-effect-values.fixtures.js";
import { EXTERNAL_PURCHASE_CONTEXT } from "./transfer-factory-observation.fixtures.js";

const SOURCE_PACKAGE = HISTORICAL_HOLDING_TEMPLATE_ID.split(":")[0]!;
const THIRD_PACKAGE = "f".repeat(64);

function setRecordPackage(value: Value | undefined, packageId: string): void {
  if (
    value?.sum.oneofKind !== "record" ||
    value.sum.record.recordId === undefined
  ) {
    throw new Error("test record identifier is absent");
  }
  value.sum.record.recordId.packageId = packageId;
}

function setRewardPackage(value: Value | undefined, packageId: string): void {
  const reward =
    value?.sum.oneofKind === "optional" ? value.sum.optional.value : undefined;
  if (
    reward?.sum.oneofKind !== "enum" ||
    reward.sum.enum.enumId === undefined
  ) {
    throw new Error("test reward identifier is absent");
  }
  reward.sum.enum.enumId.packageId = packageId;
}

describe("human prepared upgraded input values", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each([
    ["TransferPreapproval", EXTERNAL_PURCHASE_CONTEXT.transferPreapproval],
    ["FeaturedAppRight", EXTERNAL_PURCHASE_CONTEXT.featuredAppRight],
    [
      "ExternalPartyConfigState",
      EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
    ],
  ])("rejects a source-package %s argument", async (_name, contractId) => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        setRecordPackage(
          humanPreparedInput(prepared, contractId).argument,
          SOURCE_PACKAGE,
        );
      }),
    ).rejects.toThrow(/identifier/iu);
  });

  it("retains the authenticated source template instead of the selected package", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared, selectedPackage) => {
        const input = humanPreparedInput(
          prepared,
          EXTERNAL_PURCHASE_CONTEXT.transferPreapproval,
        );
        if (input.templateId === undefined) {
          throw new Error("test source template is absent");
        }
        input.templateId.packageId = selectedPackage;
      }),
    ).rejects.toThrow(/disclosed metadata input template.*identifier/iu);
  });

  it.each([
    [
      "round",
      (argument: Value | undefined) =>
        humanPreparedField(argument, "holdingFeesOpenRoundNumber"),
    ],
    [
      "transfer config",
      (argument: Value | undefined) =>
        humanPreparedField(argument, "transferConfig"),
    ],
    [
      "holding fee",
      (argument: Value | undefined) =>
        humanPreparedField(
          humanPreparedField(argument, "transferConfig"),
          "holdingFee",
        ),
    ],
  ])(
    "rejects source or third-package external config %s IDs",
    async (_name, value) => {
      for (const packageId of [SOURCE_PACKAGE, THIRD_PACKAGE]) {
        await expect(
          inspectHumanPreparedMutation((prepared) => {
            const argument = humanPreparedInput(
              prepared,
              EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
            ).argument;
            setRecordPackage(value(argument), packageId);
          }),
        ).rejects.toThrow(/identifier/iu);
      }
    },
  );

  it("rejects source or third-package reward enum IDs", async () => {
    for (const packageId of [SOURCE_PACKAGE, THIRD_PACKAGE]) {
      await expect(
        inspectHumanPreparedMutation((prepared) => {
          const argument = humanPreparedInput(
            prepared,
            EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
          ).argument;
          setRewardPackage(
            humanPreparedField(argument, "rewardCalculationVersion"),
            packageId,
          );
        }),
      ).rejects.toThrow(/reward calculation.*identifier/iu);
    }
  });
});
