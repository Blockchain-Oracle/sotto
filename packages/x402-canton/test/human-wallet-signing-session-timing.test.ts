import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanWalletSigningSession } from "../src/index.js";
import { claimVerifiedHumanWalletSigningSession } from "../src/human-wallet-signing-session-state.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  signedHumanWalletInputs,
  type SignedHumanWalletInputs,
} from "./human-wallet-signing-session.fixtures.js";

const NOW = Date.parse(HUMAN_PURCHASE_NOW);

function signing(
  input: SignedHumanWalletInputs,
  options: Readonly<{
    signal?: AbortSignal;
    timeoutMilliseconds?: number;
  }> = {},
) {
  return createHumanWalletSigningSession(
    { preflight: input.preflight, prepared: input.prepared },
    { resolveRegisteredPublicKey: async () => input.registeredKey },
    options,
  );
}

describe("policy-free human wallet session timing", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("allows human approval beyond the preflight minute", async () => {
    const input = await signedHumanWalletInputs({
      approval: async (_request, response) => {
        vi.advanceTimersByTime(2 * 60_000);
        return response;
      },
    });

    await expect(signing(input)).resolves.toMatchObject({
      outcome: "verified",
      verifiedAt: "2026-07-16T15:02:00.000Z",
    });
  });

  it("ends approval at the caller deadline and consumes the session", async () => {
    const input = await signedHumanWalletInputs({
      approval: async (_request, response) => {
        vi.advanceTimersByTime(1_001);
        return response;
      },
    });

    await expect(
      signing(input, { timeoutMilliseconds: 1_000 }),
    ).rejects.toThrow(/deadline exceeded/iu);
    await expect(signing(input)).rejects.toThrow(/already claimed/iu);
    expect(input.approvalCalls()).toBe(1);
  });

  it("cancels a hung approval without waiting for the connector", async () => {
    const input = await signedHumanWalletInputs({
      approval: async () => new Promise<never>(() => undefined),
    });
    const controller = new AbortController();
    const pending = signing(input, { signal: controller.signal });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort("private caller reason");

    await expect(pending).rejects.toEqual(
      new Error("human wallet signing session cancelled"),
    );
    expect(input.approvalCalls()).toBe(1);
  });

  it("times out hung rediscovery before approval without consuming authority", async () => {
    let hang = true;
    const input = await signedHumanWalletInputs({
      rediscover: async (capabilities) =>
        hang ? new Promise<never>(() => undefined) : capabilities,
    });
    const pending = signing(input, { timeoutMilliseconds: 10 });
    const timeout = expect(pending).rejects.toThrow(/deadline exceeded/iu);
    await vi.advanceTimersByTimeAsync(11);
    await timeout;
    expect(input.approvalCalls()).toBe(0);
    hang = false;
    await expect(signing(input)).resolves.toMatchObject({
      outcome: "verified",
    });
  });

  it("keeps execution material isolated and claimable once", async () => {
    let walletBytes: Uint8Array | undefined;
    const input = await signedHumanWalletInputs({
      approval: async (request, response) => {
        walletBytes = new Uint8Array(request.preparedTransaction);
        request.preparedTransaction[0] =
          (request.preparedTransaction[0] ?? 0) ^ 0xff;
        expect(Object.isFrozen(request)).toBe(true);
        expect(Object.isFrozen(request.approval)).toBe(true);
        return response;
      },
    });
    const verified = await signing(input);
    if (verified.outcome !== "verified") {
      throw new Error("test signature was not verified");
    }

    expect(() =>
      claimVerifiedHumanWalletSigningSession({ ...verified }),
    ).toThrow(/not authenticated/iu);
    vi.setSystemTime(NOW + 2 * 60_000);
    const claimed = claimVerifiedHumanWalletSigningSession(verified);
    expect(claimed.preparedTransaction).toEqual(walletBytes);
    expect(claimed.signature.signature).toBeTruthy();
    expect(() => claimVerifiedHumanWalletSigningSession(verified)).toThrow(
      /already claimed/iu,
    );
  });

  it("expires the private execution claim at the challenge deadline", async () => {
    const input = await signedHumanWalletInputs();
    const verified = await signing(input);
    if (verified.outcome !== "verified") {
      throw new Error("test signature was not verified");
    }
    const expiresAt = input.presented()?.expiresAt;
    if (expiresAt === undefined) throw new Error("test deadline is absent");
    vi.setSystemTime(Date.parse(expiresAt));

    expect(() => claimVerifiedHumanWalletSigningSession(verified)).toThrow(
      /expired/iu,
    );
  });
});
