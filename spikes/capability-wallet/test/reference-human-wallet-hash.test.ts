import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HUMAN_PURCHASE_NOW } from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";
import {
  claimVerifiedReferenceHumanWalletRequest,
  verifyReferenceHumanWalletRequest,
} from "../src/reference-human-wallet-hash.js";
import { serializeReferenceHumanWalletRequest } from "../src/reference-human-wallet-request.js";
import { sdkCompatibleReferenceHumanWalletRequest } from "./reference-human-wallet.fixtures.js";

describe("reference human wallet official V2 hash", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("authenticates an opaque one-use handle with the pinned Wallet SDK", async () => {
    const request = await sdkCompatibleReferenceHumanWalletRequest();
    const payload = serializeReferenceHumanWalletRequest(request);

    const verified = await verifyReferenceHumanWalletRequest(payload);

    expect(verified).toEqual({
      version: "sotto-reference-human-wallet-verified-v1",
      preparedTransactionHash: request.preparedTransactionHash,
      sessionId: request.sessionId,
      verifiedAt: HUMAN_PURCHASE_NOW,
    });
    expect(Object.isFrozen(verified)).toBe(true);
    expect(JSON.stringify(verified)).not.toMatch(
      /approval|preparedTransaction"/u,
    );
    const claimed = claimVerifiedReferenceHumanWalletRequest(verified);
    expect(claimed.approval).toEqual(request.approval);
    expect(claimed.preparedTransaction).toEqual(request.preparedTransaction);
    claimed.preparedTransaction[0]! ^= 0xff;
    expect(() => claimVerifiedReferenceHumanWalletRequest(verified)).toThrow(
      /already claimed/iu,
    );
  });

  it("rejects stale, rolled-back, or cancelled claims", async () => {
    const payload = serializeReferenceHumanWalletRequest(
      await sdkCompatibleReferenceHumanWalletRequest(),
    );
    const expired = await verifyReferenceHumanWalletRequest(payload);
    vi.setSystemTime(new Date("2026-07-16T15:10:00.000Z"));
    expect(() => claimVerifiedReferenceHumanWalletRequest(expired)).toThrow(
      /not active/iu,
    );

    vi.setSystemTime(new Date(HUMAN_PURCHASE_NOW));
    const rolledBack = await verifyReferenceHumanWalletRequest(payload);
    vi.setSystemTime(new Date(Date.parse(HUMAN_PURCHASE_NOW) - 1));
    expect(() => claimVerifiedReferenceHumanWalletRequest(rolledBack)).toThrow(
      /not active/iu,
    );

    vi.setSystemTime(new Date(HUMAN_PURCHASE_NOW));
    const cancelled = await verifyReferenceHumanWalletRequest(payload);
    const controller = new AbortController();
    controller.abort("private reason");
    const claimWithSignal = claimVerifiedReferenceHumanWalletRequest as (
      candidate: unknown,
      options: Readonly<{ signal: AbortSignal }>,
    ) => unknown;
    expect(() =>
      claimWithSignal(cancelled, { signal: controller.signal }),
    ).toThrow(/cancelled/iu);
  });

  it("rejects a forged participant digest", async () => {
    const request = await sdkCompatibleReferenceHumanWalletRequest();
    const forgedHash = `sha256:${"0".repeat(64)}` as const;
    const payload = structuredClone(
      serializeReferenceHumanWalletRequest({
        ...request,
        approval: { ...request.approval, preparedTransactionHash: forgedHash },
        preparedTransactionHash: forgedHash,
      }),
    );

    await expect(verifyReferenceHumanWalletRequest(payload)).rejects.toThrow(
      /prepared transaction hash mismatch/iu,
    );
  });

  it("hashes a private byte snapshot instead of mutable caller state", async () => {
    const request = await sdkCompatibleReferenceHumanWalletRequest();
    const payload = structuredClone(
      serializeReferenceHumanWalletRequest(request),
    );

    const pending = verifyReferenceHumanWalletRequest(payload);
    Reflect.set(
      payload.request,
      "preparedTransaction",
      Buffer.alloc(32, 9).toString("base64"),
    );

    await expect(pending).resolves.toMatchObject({
      preparedTransactionHash: request.preparedTransactionHash,
    });
  });
});
