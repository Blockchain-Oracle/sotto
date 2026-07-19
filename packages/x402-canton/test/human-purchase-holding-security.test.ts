import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanPurchaseHoldingObserver } from "../src/index.js";
import {
  claimHumanPurchaseHoldingObservation,
  readHumanPurchaseHoldingObservation,
} from "../src/human-purchase-holding-observation.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  authenticatedHumanPurchaseIntent,
  authenticatedHumanPurchaseIntentForPackage,
  humanHoldingEntry,
  humanHoldingReader,
} from "./human-purchase-holding.fixtures.js";

describe("policy-free human holding security", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("requires holdings to cover fees as well as principal", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    const observePrincipalOnly = createHumanPurchaseHoldingObserver(
      humanHoldingReader([humanHoldingEntry("00principal", "0.2500000000")]),
    );
    await expect(observePrincipalOnly(intent)).rejects.toThrow(
      /do not cover/iu,
    );

    const exact = await createHumanPurchaseHoldingObserver(
      humanHoldingReader([humanHoldingEntry("00exact", "0.3250000000")]),
    )(intent);
    expect(
      readHumanPurchaseHoldingObservation(exact, intent).contractIds,
    ).toEqual(["00exact"]);
  });

  it("rejects a non-deployed Holding package before any Ledger read", async () => {
    const intent = await authenticatedHumanPurchaseIntentForPackage(
      "f".repeat(64),
    );
    const readLedgerEnd = vi.fn();

    await expect(
      createHumanPurchaseHoldingObserver({
        readLedgerEnd,
        readActiveContracts: vi.fn(),
      })(intent),
    ).rejects.toThrow(/package selection is not approved/iu);
    expect(readLedgerEnd).not.toHaveBeenCalled();
  });

  it("rejects hostile intent and handle proxies without property access", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    const readLedgerEnd = vi.fn();
    const observe = createHumanPurchaseHoldingObserver({
      readLedgerEnd,
      readActiveContracts: vi.fn(),
    });
    let intentReads = 0;
    const hostileIntent = new Proxy(
      {},
      {
        get() {
          intentReads += 1;
          throw new Error("private-intent-getter");
        },
      },
    );
    await expect(observe(hostileIntent as never)).rejects.toThrow(
      /intent is not authenticated/iu,
    );
    expect(intentReads).toBe(0);
    expect(readLedgerEnd).not.toHaveBeenCalled();

    const observation = await createHumanPurchaseHoldingObserver(
      humanHoldingReader([humanHoldingEntry("00holding", "0.3250000000")]),
    )(intent);
    let handleReads = 0;
    const hostileHandle = new Proxy(
      {},
      {
        get() {
          handleReads += 1;
          throw new Error("private-handle-getter");
        },
      },
    );
    expect(() =>
      readHumanPurchaseHoldingObservation(hostileHandle, intent),
    ).toThrow(/not authenticated/iu);
    expect(handleReads).toBe(0);
    expect(() =>
      readHumanPurchaseHoldingObservation(observation, intent),
    ).not.toThrow();
  });

  it("does not consume a handle when the wrong purchase presents it", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    const otherIntent = await authenticatedHumanPurchaseIntent();
    const observation = await createHumanPurchaseHoldingObserver(
      humanHoldingReader([humanHoldingEntry("00holding", "0.3250000000")]),
    )(intent);

    expect(() =>
      claimHumanPurchaseHoldingObservation(observation, otherIntent),
    ).toThrow(/another purchase/iu);
    expect(
      claimHumanPurchaseHoldingObservation(observation, intent).contractIds,
    ).toEqual(["00holding"]);
  });
});
