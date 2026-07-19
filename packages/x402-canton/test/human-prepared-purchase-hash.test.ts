import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as publicApi from "../src/index.js";
import {
  claimHashVerifiedHumanPreparedPurchase,
  HUMAN_PREPARED_HASH_VERIFIED_VERSION,
  verifyHumanPreparedPurchaseHash,
} from "../src/human-prepared-purchase-hash.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import { humanPreparedHashInputs } from "./human-prepared-purchase-hash.fixtures.js";
import { RESOURCE_URL } from "./purchase-commitment.fixtures.js";

describe("policy-free human prepared V2 hash gate", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("requires participant, precheck, and official digests to match", async () => {
    const input = await humanPreparedHashInputs();
    const official = vi.fn(async (bytes: Uint8Array, options: unknown) => {
      void bytes;
      void options;
      return new Uint8Array(input.digest);
    });

    const verified = await verifyHumanPreparedPurchaseHash(input.observation, {
      recomputeOfficialHash: official,
    });

    expect(official).toHaveBeenCalledWith(
      input.transaction,
      Object.freeze({ signal: expect.any(AbortSignal) }),
    );
    expect(official.mock.calls[0]![0]).not.toBe(input.transaction);
    expect(verified).toEqual({
      version: HUMAN_PREPARED_HASH_VERIFIED_VERSION,
      observationId: input.observation.observationId,
      preparedTransactionHash: `sha256:${Buffer.from(input.digest).toString("hex")}`,
      verifiedAt: HUMAN_PURCHASE_NOW,
    });
    expect(Object.isFrozen(verified)).toBe(true);
    const serialized = JSON.stringify(verified);
    expect(serialized).not.toContain('"preparedTransaction":');
    expect(serialized).not.toContain(input.intent.challenge.payerParty);
    expect(serialized).not.toContain(input.intent.challenge.recipientParty);
    expect(serialized).not.toContain(RESOURCE_URL);
  });

  it("authenticates one private claim and exposes only verification publicly", async () => {
    expect(publicApi.verifyHumanPreparedPurchaseHash).toBe(
      verifyHumanPreparedPurchaseHash,
    );
    expect(publicApi).not.toHaveProperty(
      "claimHashVerifiedHumanPreparedPurchase",
    );
    const input = await humanPreparedHashInputs();
    const verified = await verifyHumanPreparedPurchaseHash(input.observation, {
      recomputeOfficialHash: async () => input.digest,
    });

    expect(() =>
      claimHashVerifiedHumanPreparedPurchase({ ...verified }),
    ).toThrow(/not authenticated/iu);
    const claimed = claimHashVerifiedHumanPreparedPurchase(verified);
    expect(claimed.preparedTransaction).toEqual(input.transaction);
    expect(claimed.preparedTransactionHash).toEqual(input.digest);
    expect(claimed.intent).toBe(input.intent);
    expect(claimed.prepareRequest).toBe(input.request);
    expect(() => claimHashVerifiedHumanPreparedPurchase(verified)).toThrow(
      /already claimed/iu,
    );
  });
});
