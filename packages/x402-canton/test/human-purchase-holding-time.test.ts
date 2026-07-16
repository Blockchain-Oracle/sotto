import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHumanPurchaseHoldingObserver,
  type HumanPurchaseHoldingReader,
} from "../src/index.js";
import {
  claimHumanPurchaseHoldingObservation,
  readHumanPurchaseHoldingObservation,
} from "../src/human-purchase-holding-observation.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  authenticatedHumanPurchaseIntent,
  humanHoldingEntry,
  humanHoldingReader,
} from "./human-purchase-holding.fixtures.js";

describe("policy-free human holding time boundaries", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("stops before the ACS read when the challenge expires mid-acquisition", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    vi.advanceTimersByTime(599_995);
    const readActiveContracts = vi.fn();
    const reader: HumanPurchaseHoldingReader = {
      readLedgerEnd: async () => {
        vi.advanceTimersByTime(5);
        return { offset: 42 };
      },
      readActiveContracts,
    };

    await expect(
      createHumanPurchaseHoldingObserver(reader)(intent),
    ).rejects.toThrow(/expired/iu);
    expect(readActiveContracts).not.toHaveBeenCalled();
  });

  it("detects a material clock rollback during acquisition", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    vi.advanceTimersByTime(30_000);
    const readActiveContracts = vi.fn();
    const reader: HumanPurchaseHoldingReader = {
      readLedgerEnd: async () => {
        vi.setSystemTime(Date.parse(HUMAN_PURCHASE_NOW) + 23_999);
        return { offset: 42 };
      },
      readActiveContracts,
    };

    await expect(
      createHumanPurchaseHoldingObserver(reader)(intent),
    ).rejects.toThrow(/clock moved backwards/iu);
    expect(readActiveContracts).not.toHaveBeenCalled();
  });

  it("rejects stale, expired, and materially rolled-back handles", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    const observe = createHumanPurchaseHoldingObserver(
      humanHoldingReader([humanHoldingEntry("00holding", "0.3250000000")]),
    );
    const stale = await observe(intent);
    vi.advanceTimersByTime(60_001);
    expect(() => readHumanPurchaseHoldingObservation(stale, intent)).toThrow(
      /stale/iu,
    );

    vi.setSystemTime(new Date(HUMAN_PURCHASE_NOW));
    const rolledBack = await observe(intent);
    vi.setSystemTime(Date.parse(HUMAN_PURCHASE_NOW) - 5_001);
    expect(() =>
      readHumanPurchaseHoldingObservation(rolledBack, intent),
    ).toThrow(/clock moved backwards/iu);

    vi.setSystemTime(new Date(HUMAN_PURCHASE_NOW));
    const expired = await observe(intent);
    vi.advanceTimersByTime(600_000);
    expect(() => readHumanPurchaseHoldingObservation(expired, intent)).toThrow(
      /expired|stale/iu,
    );
  });

  it.each([
    [480_000, true],
    [480_001, false],
  ] as const)(
    "enforces the two-minute command reserve at %i milliseconds",
    async (elapsed, accepted) => {
      const intent = await authenticatedHumanPurchaseIntent();
      vi.advanceTimersByTime(elapsed);
      const observation = await createHumanPurchaseHoldingObserver(
        humanHoldingReader([humanHoldingEntry("00holding", "0.3250000000")]),
      )(intent);

      if (accepted) {
        expect(() =>
          claimHumanPurchaseHoldingObservation(observation, intent),
        ).not.toThrow();
      } else {
        expect(() =>
          claimHumanPurchaseHoldingObservation(observation, intent),
        ).toThrow(/signing reserve/iu);
        expect(() =>
          readHumanPurchaseHoldingObservation(observation, intent),
        ).not.toThrow();
      }
    },
  );
});
