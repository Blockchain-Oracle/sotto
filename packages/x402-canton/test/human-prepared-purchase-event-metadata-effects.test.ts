import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanPreparedExercise,
  humanPreparedField,
  inspectHumanPreparedMutation,
} from "./human-prepared-purchase-effect-test-support.js";

describe("human prepared transfer event metadata effects", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("rejects an altered Sotto hash in an EventLog leg", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        const legs = humanPreparedField(
          humanPreparedExercise(prepared, "7").chosenValue,
          "transferLegSides",
        );
        if (legs.sum.oneofKind !== "list")
          throw new Error("test legs are absent");
        const metadata = humanPreparedField(legs.sum.list.elements[0], "meta");
        const values = humanPreparedField(metadata, "values");
        if (
          values.sum.oneofKind !== "textMap" ||
          values.sum.textMap.entries[0]?.value?.sum.oneofKind !== "text"
        ) {
          throw new Error("test metadata is absent");
        }
        values.sum.textMap.entries[0].value.sum.text = "sha256:deadbeef";
      }),
    ).rejects.toThrow(/prepared/iu);
  });

  it("rejects an altered Sotto hash in the factory result", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        const metadata = humanPreparedField(
          humanPreparedExercise(prepared, "0").exerciseResult,
          "meta",
        );
        const values = humanPreparedField(metadata, "values");
        if (
          values.sum.oneofKind !== "textMap" ||
          values.sum.textMap.entries[0]?.value?.sum.oneofKind !== "text"
        ) {
          throw new Error("test metadata is absent");
        }
        values.sum.textMap.entries[0].value.sum.text = "sha256:deadbeef";
      }),
    ).rejects.toThrow(/prepared/iu);
  });
});
