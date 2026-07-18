import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectHumanPreparedPurchaseApproval } from "../src/human-purchase-approval.js";
import { verifyHumanPreparedPurchaseHash } from "../src/human-prepared-purchase-hash.js";
import { readHashVerifiedHumanPreparedPurchase } from "../src/human-prepared-purchase-hash-state.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import { humanPreparedHashInputs } from "./human-prepared-purchase-hash.fixtures.js";

async function verifiedPurchase() {
  const input = await humanPreparedHashInputs();
  const verified = await verifyHumanPreparedPurchaseHash(input.observation, {
    recomputeOfficialHash: async () => input.digest,
  });
  return { input, verified };
}

describe("human purchase approval security", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("reads only bounded non-consuming approval state", async () => {
    const { input, verified } = await verifiedPurchase();
    const state = readHashVerifiedHumanPreparedPurchase(verified);

    expect(Object.keys(state).sort()).toEqual(
      [
        "capturedAt",
        "intent",
        "preparedTransactionHash",
        "transferContextHash",
        "verifiedAt",
      ].sort(),
    );
    expect(state.transferContextHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(state.preparedTransactionHash).toEqual(input.digest);
    expect(state.preparedTransactionHash).not.toBe(input.digest);
  });

  it("expires at execution time and rejects clock rollback", async () => {
    const active = await verifiedPurchase();
    vi.advanceTimersByTime(10_001);
    expect(() =>
      projectHumanPreparedPurchaseApproval(active.verified),
    ).not.toThrow();

    vi.setSystemTime(Date.parse(active.input.intent.challenge.executeBefore));
    expect(() => projectHumanPreparedPurchaseApproval(active.verified)).toThrow(
      /expired/iu,
    );

    vi.setSystemTime(Date.parse(HUMAN_PURCHASE_NOW) - 5_001);
    expect(() => projectHumanPreparedPurchaseApproval(active.verified)).toThrow(
      /clock moved backwards/iu,
    );
  });
});
