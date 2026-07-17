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
      ["capturedAt", "intent", "preparedTransactionHash", "verifiedAt"].sort(),
    );
    expect(state.preparedTransactionHash).toEqual(input.digest);
    expect(state.preparedTransactionHash).not.toBe(input.digest);
  });

  it("rejects stale and clock-rollback projections", async () => {
    const stale = await verifiedPurchase();
    vi.advanceTimersByTime(10_001);
    expect(() => projectHumanPreparedPurchaseApproval(stale.verified)).toThrow(
      /stale/iu,
    );

    vi.setSystemTime(new Date(HUMAN_PURCHASE_NOW));
    const rollback = await verifiedPurchase();
    vi.setSystemTime(Date.now() - 5_001);
    expect(() =>
      projectHumanPreparedPurchaseApproval(rollback.verified),
    ).toThrow(/clock moved backwards/iu);
  });
});
