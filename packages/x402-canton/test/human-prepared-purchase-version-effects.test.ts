import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanPreparedExercise,
  inspectHumanPreparedMutation,
} from "./human-prepared-purchase-effect-test-support.js";

describe("human prepared version and root-fetch effects", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("rejects an unsupported transaction version", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        prepared.transaction!.version = "2.2";
      }),
    ).rejects.toThrow(/prepared/iu);
  });

  it("rejects an unsupported effect LF version", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        humanPreparedExercise(prepared, "1").lfVersion = "2.2";
      }),
    ).rejects.toThrow(/prepared/iu);
  });

  it("rejects a missing factory-level authenticated fetch", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        const root = humanPreparedExercise(prepared, "0");
        root.children = root.children.filter((nodeId) => nodeId !== "10");
        prepared.transaction!.nodes = prepared.transaction!.nodes.filter(
          ({ nodeId }) => nodeId !== "10",
        );
      }),
    ).rejects.toThrow(/prepared/iu);
  });
});
