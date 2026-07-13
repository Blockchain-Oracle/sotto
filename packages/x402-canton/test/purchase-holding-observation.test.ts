import { describe, expect, it, vi } from "vitest";
import {
  HOLDING_INTERFACE_QUERY_ID,
  createPurchaseHoldingObserver,
} from "../src/index.js";
import {
  claimPurchaseHoldingObservation,
  readPurchaseHoldingObservation,
} from "../src/purchase-holding-observation.js";
import {
  authenticatedPurchaseIntent,
  holdingEntry,
  holdingReader,
} from "./purchase-holding-observation.fixtures.js";
import { PAYER } from "./purchase-commitment.fixtures.js";

describe("purchase holding observation", () => {
  it("queries only the committed payer at one fresh Ledger end", async () => {
    const reader = holdingReader([
      holdingEntry("00holding-a", "2.0000000000"),
      holdingEntry("00holding-b", "1.5000000000"),
    ]);
    const readActiveContracts = vi.spyOn(reader, "readActiveContracts");
    const intent = authenticatedPurchaseIntent();

    const observation = await createPurchaseHoldingObserver(reader)(intent);

    expect(readActiveContracts).toHaveBeenCalledWith({
      filter: {
        filtersByParty: {
          [PAYER]: {
            cumulative: [
              {
                identifierFilter: {
                  InterfaceFilter: {
                    value: {
                      interfaceId: HOLDING_INTERFACE_QUERY_ID,
                      includeCreatedEventBlob: true,
                      includeInterfaceView: true,
                    },
                  },
                },
              },
            ],
          },
        },
      },
      verbose: false,
      activeAtOffset: 42,
    });
    expect(Object.keys(observation).sort()).toEqual([
      "observationId",
      "observedAt",
    ]);
    expect(observation.observationId).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(observation)).not.toContain("00holding");
  });

  it("selects the smallest deterministic prefix covering the debit ceiling", async () => {
    const intent = authenticatedPurchaseIntent();
    const observation = await createPurchaseHoldingObserver(
      holdingReader([
        holdingEntry("00holding-c", "0.0200000000"),
        holdingEntry("00holding-b", "0.1500000000"),
        holdingEntry("00holding-a", "0.2000000000"),
      ]),
    )(intent);

    expect(
      readPurchaseHoldingObservation(observation, intent).contractIds,
    ).toEqual(["00holding-a", "00holding-b"]);
  });

  it("uses fresh entropy rather than leaking holding identity", async () => {
    const intent = authenticatedPurchaseIntent();
    const observe = createPurchaseHoldingObserver(
      holdingReader([holdingEntry("00holding-a", "0.3250000000")]),
    );

    const first = await observe(intent);
    const second = await observe(intent);

    expect(first.observationId).not.toBe(second.observationId);
    expect(JSON.stringify([first, second])).not.toContain("0.3250000000");
  });

  it("rejects a structural intent clone before reading the Ledger", async () => {
    const reader = holdingReader([]);
    const readLedgerEnd = vi.spyOn(reader, "readLedgerEnd");
    const observe = createPurchaseHoldingObserver(reader);

    await expect(
      observe(structuredClone(authenticatedPurchaseIntent())),
    ).rejects.toThrow("not authenticated");
    expect(readLedgerEnd).not.toHaveBeenCalled();
  });

  it("claims a fresh observation exactly once", async () => {
    const intent = authenticatedPurchaseIntent();
    const observation = await createPurchaseHoldingObserver(
      holdingReader([holdingEntry("00holding-a", "0.3250000000")]),
    )(intent);

    expect(
      claimPurchaseHoldingObservation(observation, intent).contractIds,
    ).toEqual(["00holding-a"]);
    expect(() => claimPurchaseHoldingObservation(observation, intent)).toThrow(
      "already claimed",
    );
  });

  it("uses byte-ordinal rather than locale-dependent tie ordering", async () => {
    const intent = authenticatedPurchaseIntent();
    const observation = await createPurchaseHoldingObserver(
      holdingReader([
        holdingEntry("00holding-ä", "0.2000000000"),
        holdingEntry("00holding-z", "0.2000000000"),
        holdingEntry("00holding-a", "0.2000000000"),
      ]),
    )(intent);

    expect(
      readPurchaseHoldingObservation(observation, intent).contractIds,
    ).toEqual(["00holding-a", "00holding-z"]);
  });

  it("expires observations and detects material clock rollback", async () => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:00.000Z") });
    try {
      const intent = authenticatedPurchaseIntent();
      const observe = createPurchaseHoldingObserver(
        holdingReader([holdingEntry("00holding-a", "0.3250000000")]),
      );
      const stale = await observe(intent);
      vi.advanceTimersByTime(60_001);
      expect(() => readPurchaseHoldingObservation(stale, intent)).toThrow(
        "stale",
      );

      vi.setSystemTime(new Date("2026-07-13T10:00:00.000Z"));
      const rolledBack = await observe(intent);
      vi.setSystemTime(new Date("2026-07-13T09:59:54.999Z"));
      expect(() => readPurchaseHoldingObservation(rolledBack, intent)).toThrow(
        "clock moved backwards",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects an ACS acquisition that itself exceeds the freshness window", async () => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:00.000Z") });
    try {
      const intent = authenticatedPurchaseIntent();
      const observe = createPurchaseHoldingObserver({
        readLedgerEnd: async () => {
          vi.advanceTimersByTime(30_000);
          return { offset: 42 };
        },
        readActiveContracts: async () => {
          vi.advanceTimersByTime(30_001);
          return [holdingEntry("00holding", "0.3250000000")];
        },
      });

      await expect(observe(intent)).rejects.toThrow("acquisition is stale");
    } finally {
      vi.useRealTimers();
    }
  });
});
