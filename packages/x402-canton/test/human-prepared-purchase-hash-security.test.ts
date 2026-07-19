import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HUMAN_PREPARED_HASH_TIMEOUT_MS,
  verifyHumanPreparedPurchaseHash,
  type HumanPreparedPurchaseHashDependencies,
} from "../src/human-prepared-purchase-hash.js";
import { projectHumanPreparedPurchaseApproval } from "../src/human-purchase-approval.js";
import { claimHashVerifiedHumanPreparedPurchase } from "../src/human-prepared-purchase-hash-state.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanPreparedHashInputs,
  humanPreparedHashInputsWithWindow,
} from "./human-prepared-purchase-hash.fixtures.js";

describe("policy-free human prepared hash security", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("stops before the official oracle after a participant mismatch", async () => {
    const input = await humanPreparedHashInputs(new Uint8Array(32).fill(9));
    const official = vi.fn(async () => input.digest);

    await expect(
      verifyHumanPreparedPurchaseHash(input.observation, {
        recomputeOfficialHash: official,
      }),
    ).rejects.toThrow(/precheck.*participant/iu);
    expect(official).not.toHaveBeenCalled();
    await expect(
      verifyHumanPreparedPurchaseHash(input.observation, {
        recomputeOfficialHash: official,
      }),
    ).rejects.toThrow(/already claimed/iu);
  });

  it("validates dependencies and options before consuming observation", async () => {
    const input = await humanPreparedHashInputs();

    await expect(
      verifyHumanPreparedPurchaseHash(input.observation, {} as never),
    ).rejects.toThrow(/official.*required/iu);
    await expect(
      verifyHumanPreparedPurchaseHash(input.observation, {
        recomputeOfficialHash: async () => input.digest,
        extra: true,
      } as never),
    ).rejects.toThrow(/official.*required/iu);
    await expect(
      verifyHumanPreparedPurchaseHash(
        input.observation,
        { recomputeOfficialHash: async () => input.digest },
        null as never,
      ),
    ).rejects.toThrow(/options are invalid/iu);
    await expect(
      verifyHumanPreparedPurchaseHash(input.observation, {
        recomputeOfficialHash: async () => input.digest,
      }),
    ).resolves.toBeDefined();
  });

  it.each([
    ["non-bytes", async () => "invalid"],
    ["short", async () => new Uint8Array(31)],
    ["long", async () => new Uint8Array(33)],
    ["shared", async () => new Uint8Array(new SharedArrayBuffer(32))],
    ["mismatch", async () => new Uint8Array(32).fill(9)],
  ])("rejects a %s official digest", async (_name, recompute) => {
    const input = await humanPreparedHashInputs();
    await expect(
      verifyHumanPreparedPurchaseHash(input.observation, {
        recomputeOfficialHash:
          recompute as HumanPreparedPurchaseHashDependencies["recomputeOfficialHash"],
      }),
    ).rejects.toThrow(/official.*(?:32 bytes|isolated|participant)/iu);
  });

  it("sanitizes official failures and consumes the attempt", async () => {
    const input = await humanPreparedHashInputs();
    const dependencies = {
      recomputeOfficialHash: async () => {
        throw new Error("private SDK error with prepared bytes");
      },
    };

    await expect(
      verifyHumanPreparedPurchaseHash(input.observation, dependencies),
    ).rejects.toEqual(
      new Error("official human prepared hash recomputation failed"),
    );
    await expect(
      verifyHumanPreparedPurchaseHash(input.observation, dependencies),
    ).rejects.toThrow(/already claimed/iu);
  });

  it("isolates retained bytes and the official digest", async () => {
    const input = await humanPreparedHashInputs();
    const returned = new Uint8Array(input.digest);
    const verified = await verifyHumanPreparedPurchaseHash(input.observation, {
      recomputeOfficialHash: async (bytes) => {
        bytes[0] = (bytes.at(0) ?? 0) ^ 0xff;
        return returned;
      },
    });
    returned.fill(0);

    const claimed = claimHashVerifiedHumanPreparedPurchase(verified);
    expect(claimed.preparedTransaction).toEqual(input.transaction);
    expect(claimed.preparedTransactionHash).toEqual(input.digest);
  });

  it("uses the committed execution window after fresh hash verification", async () => {
    const input = await humanPreparedHashInputs();
    const verified = await verifyHumanPreparedPurchaseHash(input.observation, {
      recomputeOfficialHash: async () => input.digest,
    });

    vi.advanceTimersByTime(10_001);
    expect(() => projectHumanPreparedPurchaseApproval(verified)).not.toThrow();

    vi.setSystemTime(Date.parse(input.intent.challenge.executeBefore) - 1);
    expect(() => projectHumanPreparedPurchaseApproval(verified)).not.toThrow();

    vi.setSystemTime(Date.parse(input.intent.challenge.executeBefore));
    expect(() => projectHumanPreparedPurchaseApproval(verified)).toThrow(
      /expired/iu,
    );
  });

  it("rejects forged and stale observations before the official oracle", async () => {
    const first = await humanPreparedHashInputs();
    const official = vi.fn(async () => first.digest);
    await expect(
      verifyHumanPreparedPurchaseHash(
        { ...first.observation },
        { recomputeOfficialHash: official },
      ),
    ).rejects.toThrow(/not authenticated/iu);
    expect(official).not.toHaveBeenCalled();
    await expect(
      verifyHumanPreparedPurchaseHash(first.observation, {
        recomputeOfficialHash: official,
      }),
    ).resolves.toBeDefined();

    const second = await humanPreparedHashInputs();
    vi.advanceTimersByTime(10_001);
    await expect(
      verifyHumanPreparedPurchaseHash(second.observation, {
        recomputeOfficialHash: official,
      }),
    ).rejects.toThrow(/stale/iu);
    expect(official).toHaveBeenCalledOnce();
  });

  it("rechecks clock and signing reserve after the official await", async () => {
    const rollback = await humanPreparedHashInputs();
    await expect(
      verifyHumanPreparedPurchaseHash(rollback.observation, {
        recomputeOfficialHash: async () => {
          vi.setSystemTime(Date.now() - 5_001);
          return rollback.digest;
        },
      }),
    ).rejects.toThrow(/clock moved backwards/iu);

    vi.setSystemTime(new Date(HUMAN_PURCHASE_NOW));
    const short = await humanPreparedHashInputsWithWindow(121);
    await expect(
      verifyHumanPreparedPurchaseHash(short.observation, {
        recomputeOfficialHash: async () => {
          vi.setSystemTime(Date.now() + 1_001);
          return short.digest;
        },
      }),
    ).rejects.toThrow(/signing reserve/iu);
  });

  it("cancels a hung official oracle without minting authority", async () => {
    const input = await humanPreparedHashInputs();
    let started!: () => void;
    const oracleStarted = new Promise<void>((resolve) => (started = resolve));
    const pending = verifyHumanPreparedPurchaseHash(
      input.observation,
      {
        recomputeOfficialHash: async () => {
          started();
          return new Promise<never>(() => undefined);
        },
      },
      { timeoutMilliseconds: 10 },
    );
    await oracleStarted;
    const expired = expect(pending).rejects.toThrow(/deadline exceeded/iu);
    await vi.advanceTimersByTimeAsync(11);
    await expired;
    expect(HUMAN_PREPARED_HASH_TIMEOUT_MS).toBe(10_000);
  });
});
