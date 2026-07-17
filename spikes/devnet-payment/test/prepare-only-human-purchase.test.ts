import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  prepareOnlyHumanPurchase,
  type PrepareOnlyHumanPurchaseInput,
} from "../src/prepare-only-human-purchase.js";
import {
  prepareOnlyHumanInput,
  PROVIDER,
} from "./prepare-only-human-purchase.fixtures.js";

describe("prepare-only policy-free human purchase", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-16T15:00:00.000Z") });
  });

  afterEach(() => vi.useRealTimers());

  it("preflights, prepares, verifies, and stops before wallet approval", async () => {
    const events: string[] = [];
    const input = await prepareOnlyHumanInput(events);
    const result = await prepareOnlyHumanPurchase(input);

    expect(events).toEqual([
      "wallet-preflight",
      "payment-402",
      "holdings-ledger-end",
      "holdings-acs",
      "registry",
      "prepare",
      "official-hash",
    ]);
    expect(result).toMatchObject({
      status: "prepared-hash-verified-not-signed",
      approval: {
        action: "pay-for-api-call",
        authorizationMode: "human-wallet",
        providerParty: PROVIDER,
        amountAtomic: "2500000000",
      },
    });
    expect(result.verified.preparedTransactionHash).toMatch(
      /^sha256:[0-9a-f]{64}$/u,
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('"preparedTransaction":');
    expect(serialized).not.toContain('"signature":');
    expect(result).not.toHaveProperty("execute");
    expect(result).not.toHaveProperty("settlement");
  });

  it("derives the exact package scope from trusted configuration and 402 time", async () => {
    const events: string[] = [];
    const input = await prepareOnlyHumanInput(events);
    const claim = vi.fn(input.claimPackageSelection);

    await prepareOnlyHumanPurchase({ ...input, claimPackageSelection: claim });

    expect(claim).toHaveBeenCalledWith({
      adminParty: input.trustedConfiguration.expectedAdmin,
      challengeId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      challengeObservedAt: "2026-07-16T15:00:00.000Z",
      executeBefore: "2026-07-16T15:10:00.000Z",
      providerParty: input.expectedProviderParty,
      signal: expect.any(AbortSignal),
      walletPreflight: expect.any(Object),
    });
  });

  it("cancels a hung wallet preflight before provider or Ledger reads", async () => {
    const events: string[] = [];
    const input = await prepareOnlyHumanInput(events);
    events.length = 0;
    const controller = new AbortController();
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => (started = resolve));
    const purchase = prepareOnlyHumanPurchase({
      ...input,
      createWalletPreflight: async () => {
        started();
        return new Promise<never>(() => undefined);
      },
      signal: controller.signal,
    });
    await waiting;
    controller.abort("private reason");

    await expect(purchase).rejects.toThrow("human purchase cancelled");
    await expect(purchase).rejects.not.toThrow(/private reason/u);
    expect(events).toEqual([]);
  });

  it("cancels after package acquisition before consuming it or reading Ledger state", async () => {
    const events: string[] = [];
    const input = await prepareOnlyHumanInput(events);
    events.length = 0;
    const controller = new AbortController();
    const createReaders = vi.fn(input.createReaders);

    await expect(
      prepareOnlyHumanPurchase({
        ...input,
        claimPackageSelection: ((scope: never) => {
          const selected = input.claimPackageSelection(scope);
          return {
            then: (
              resolve: (value: unknown) => void,
              reject: (error: unknown) => void,
            ) =>
              selected.then((value) => {
                resolve(value);
                controller.abort("private reason");
              }, reject),
          } as Promise<never>;
        }) as never,
        createReaders,
        signal: controller.signal,
      }),
    ).rejects.toThrow("human purchase cancelled");
    expect(createReaders).not.toHaveBeenCalled();
    expect(events).toEqual(["wallet-preflight", "payment-402"]);
  });

  it.each([0, 30_001, 1.5, Number.POSITIVE_INFINITY])(
    "rejects invalid total timeout %s before callbacks",
    async (timeoutMilliseconds) => {
      const events: string[] = [];
      const input = await prepareOnlyHumanInput(events);
      events.length = 0;
      await expect(
        prepareOnlyHumanPurchase({
          ...input,
          timeoutMilliseconds,
        } as PrepareOnlyHumanPurchaseInput),
      ).rejects.toThrow(/timeout/iu);
      expect(events).toEqual([]);
    },
  );
});
