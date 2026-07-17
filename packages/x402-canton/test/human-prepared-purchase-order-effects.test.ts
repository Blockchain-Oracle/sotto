import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectHumanPreparedPurchaseStructure } from "../src/human-prepared-purchase-validation.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import { humanHoldingEntry } from "./human-purchase-holding.fixtures.js";
import {
  humanPreparedExercise,
  inspectHumanPreparedMutation,
} from "./human-prepared-purchase-effect-test-support.js";
import {
  humanPreparedPurchaseBytes,
  humanPreparedPurchaseCommandInputsFor,
  validHumanPreparedPurchase,
} from "./human-prepared-purchase.fixtures.js";

function swap(values: string[], left: number, right: number): void {
  [values[left], values[right]] = [values[right]!, values[left]!];
}

describe("human prepared transfer effect order", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("rejects reordered root fetches", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        swap(humanPreparedExercise(prepared, "0").children, 0, 1);
      }),
    ).rejects.toThrow(/prepared/iu);
  });

  it("rejects reordered inner fetches", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        swap(humanPreparedExercise(prepared, "1").children, 0, 1);
      }),
    ).rejects.toThrow(/prepared/iu);
  });

  it("rejects reordered terminal EventLogs", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        swap(humanPreparedExercise(prepared, "1").children, 6, 7);
      }),
    ).rejects.toThrow(/prepared/iu);
  });

  it("rejects an output create before the input archive", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        swap(humanPreparedExercise(prepared, "1").children, 3, 4);
      }),
    ).rejects.toThrow(/prepared/iu);
  });

  it("rejects payer change before the receiver output", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        swap(humanPreparedExercise(prepared, "1").children, 4, 5);
      }),
    ).rejects.toThrow(/prepared/iu);
  });

  it("accepts the source-faithful two-input fetch/archive fold", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputsFor([
      humanHoldingEntry("00holding-multi-a", "0.2000000000"),
      humanHoldingEntry("00holding-multi-b", "0.1250000000"),
    ]);
    const prepared = validHumanPreparedPurchase(intent, request);

    expect(humanPreparedExercise(prepared, "1").children).toEqual([
      "5",
      "6",
      "13",
      "2",
      "15",
      "16",
      "3",
      "4",
      "7",
      "8",
    ]);
    expect(() =>
      inspectHumanPreparedPurchaseStructure(
        humanPreparedPurchaseBytes(intent, request),
        intent,
        request,
      ),
    ).not.toThrow();
  });
});
