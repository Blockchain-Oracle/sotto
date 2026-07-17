import type { Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fixtureMetadata,
  fixtureScalar,
} from "./prepared-purchase-value.fixtures.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanPreparedCreate,
  humanPreparedExercise,
  humanPreparedField,
  humanPreparedReplaceField,
  inspectHumanPreparedMutation,
} from "./human-prepared-purchase-effect-test-support.js";

type Fixture = Parameters<typeof humanPreparedExercise>[0];

function transferResult(prepared: Fixture): Value {
  return humanPreparedField(
    humanPreparedExercise(prepared, "1").exerciseResult,
    "result",
  );
}

function summary(prepared: Fixture): Value {
  return humanPreparedField(transferResult(prepared), "summary");
}

function replaceNumeric(record: Value, label: string, value: string): void {
  humanPreparedReplaceField(record, label, fixtureScalar("numeric", value));
}

describe("human prepared transfer accounting effects", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each([
    [
      "summary input amount",
      (prepared: Fixture) =>
        replaceNumeric(summary(prepared), "inputAmuletAmount", "0.3240000000"),
    ],
    [
      "summary output fee",
      (prepared: Fixture) => {
        const fees = humanPreparedField(summary(prepared), "outputFees");
        if (fees.sum.oneofKind !== "list")
          throw new Error("test fees are absent");
        fees.sum.list.elements[0] = fixtureScalar("numeric", "0.0010000000");
      },
    ],
    [
      "sender change amount",
      (prepared: Fixture) =>
        replaceNumeric(
          humanPreparedField(
            humanPreparedCreate(prepared, "4").argument,
            "amount",
          ),
          "initialAmount",
          "0.0740000000",
        ),
    ],
    [
      "receiver owner",
      (prepared: Fixture) =>
        humanPreparedReplaceField(
          humanPreparedCreate(prepared, "3").argument,
          "owner",
          fixtureScalar("party", "wrong-owner::1220wrong"),
        ),
    ],
  ] as const)("rejects a changed %s", async (_name, mutate) => {
    await expect(inspectHumanPreparedMutation(mutate)).rejects.toThrow(
      /prepared/iu,
    );
  });

  it("rejects a receiver CID mismatch across factory results", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
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
        const ids = humanPreparedField(
          output.sum.variant.value,
          "receiverHoldingCids",
        );
        if (ids.sum.oneofKind !== "list")
          throw new Error("test IDs are absent");
        ids.sum.list.elements[0] = fixtureScalar("contractId", "00wrong");
      }),
    ).rejects.toThrow(/prepared/iu);
  });

  it("rejects a receiver CID mismatch in the preapproval result", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        const created = humanPreparedField(
          transferResult(prepared),
          "createdAmulets",
        );
        if (
          created.sum.oneofKind !== "list" ||
          created.sum.list.elements[0]?.sum.oneofKind !== "variant" ||
          created.sum.list.elements[0].sum.variant.value === undefined
        ) {
          throw new Error("test created Amulet is absent");
        }
        created.sum.list.elements[0].sum.variant.value = fixtureScalar(
          "contractId",
          "00wrong",
        );
      }),
    ).rejects.toThrow(/prepared/iu);
  });

  it("rejects unstripped inner transfer metadata", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        humanPreparedReplaceField(transferResult(prepared), "meta", {
          sum: {
            oneofKind: "optional",
            optional: { value: fixtureMetadata({ injected: "secret" }) },
          },
        });
      }),
    ).rejects.toThrow(/prepared/iu);
  });
});
