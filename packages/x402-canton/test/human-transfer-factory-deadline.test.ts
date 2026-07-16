import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimHumanTransferFactoryObservation,
  createHumanTransferFactoryObserver,
} from "../src/human-transfer-factory-observation.js";
import { createHumanPurchaseHoldingObserver } from "../src/index.js";
import { readHumanPurchaseHoldingObservation } from "../src/human-purchase-holding-observation.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  authenticatedHumanPurchaseIntentWithWindow,
  humanHoldingEntry,
  humanHoldingReader,
} from "./human-purchase-holding.fixtures.js";
import {
  humanTransferFactoryInputs,
  humanTransferFactoryResponseBytes,
} from "./human-transfer-factory.fixtures.js";

describe("policy-free human TransferFactory deadlines", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("settles a caller cancellation even when the reader ignores abort", async () => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    const controller = new AbortController();
    let readerSignal: AbortSignal | undefined;
    const purchase = createHumanTransferFactoryObserver(
      async (_request, { signal }) => {
        readerSignal = signal;
        return await new Promise<Uint8Array>(() => undefined);
      },
    )(intent, holdings, { signal: controller.signal });

    controller.abort("private caller reason");

    await expect(purchase).rejects.toEqual(
      new Error("human TransferFactory observation cancelled"),
    );
    expect(readerSignal?.aborted).toBe(true);
    expect(() =>
      readHumanPurchaseHoldingObservation(holdings, intent),
    ).not.toThrow();
  });

  it("enforces a short outer deadline against a hung reader", async () => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    let readerSignal: AbortSignal | undefined;
    const purchase = createHumanTransferFactoryObserver(
      async (_request, { signal }) => {
        readerSignal = signal;
        return await new Promise<Uint8Array>(() => undefined);
      },
    )(intent, holdings, { timeoutMilliseconds: 10 });
    const rejection = expect(purchase).rejects.toEqual(
      new Error("human TransferFactory observation deadline exceeded"),
    );

    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    expect(readerSignal?.aborted).toBe(true);
  });

  it("rejects an invalid timeout before the registry read", async () => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    const reader = vi.fn();

    await expect(
      createHumanTransferFactoryObserver(reader)(intent, holdings, {
        timeoutMilliseconds: 10_001,
      }),
    ).rejects.toThrow(/timeout is invalid/iu);
    expect(reader).not.toHaveBeenCalled();
  });

  it.each([
    [10_000, true],
    [10_001, false],
  ])("bounds acquisition at %i milliseconds", async (elapsed, accepted) => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    const observe = createHumanTransferFactoryObserver(async () => {
      vi.setSystemTime(Date.now() + elapsed);
      return humanTransferFactoryResponseBytes(intent);
    });

    if (accepted) {
      await expect(observe(intent, holdings)).resolves.toBeDefined();
    } else {
      await expect(observe(intent, holdings)).rejects.toThrow(/stale/iu);
    }
  });

  it.each([
    [1_000, true],
    [1_001, false],
  ])(
    "enforces the signing reserve after %i milliseconds",
    async (elapsed, accepted) => {
      const intent = await authenticatedHumanPurchaseIntentWithWindow(121);
      const holdings = await createHumanPurchaseHoldingObserver(
        humanHoldingReader([humanHoldingEntry("00human", "0.3250000000")]),
      )(intent);
      const observation = await createHumanTransferFactoryObserver(async () =>
        humanTransferFactoryResponseBytes(intent),
      )(intent, holdings);
      vi.setSystemTime(Date.now() + elapsed);

      if (accepted) {
        expect(() =>
          claimHumanTransferFactoryObservation(observation, intent, holdings),
        ).not.toThrow();
      } else {
        expect(() =>
          claimHumanTransferFactoryObservation(observation, intent, holdings),
        ).toThrow(/signing reserve/iu);
        expect(() =>
          readHumanPurchaseHoldingObservation(holdings, intent),
        ).not.toThrow();
      }
    },
  );
});
