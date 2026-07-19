import { describe, expect, it, vi } from "vitest";
import { commitBoundedPurchase } from "../src/index.js";
import {
  createPurchaseCapabilityObserver,
  readPurchaseCapabilityObservation,
} from "../src/purchase-capability-observation.js";
import {
  captureCapabilityEvent,
  createdCapabilityEvent,
} from "./purchase-capability-observation.fixtures.js";
import { AGENT, createPurchaseInput } from "./purchase-commitment.fixtures.js";

describe("purchase capability observation", () => {
  it("commits a trusted-reader Ledger event without a synthetic event offset", async () => {
    const observe = createPurchaseCapabilityObserver(async () => ({
      activeAtOffset: 42,
      createdEvent: createdCapabilityEvent(),
    }));
    const capability = await observe("00capability7");
    const result = commitBoundedPurchase({
      ...createPurchaseInput(),
      capability,
    });

    expect(new TextDecoder().decode(result.canonicalBytes)).toContain(
      `"agentParty":"${AGENT}"`,
    );
    expect(Object.keys(capability).sort()).toEqual([
      "observationId",
      "observedAt",
    ]);
    expect(JSON.stringify(capability)).not.toContain("00capability7");
  });

  it("rejects a forged observation look-alike", () => {
    expect(() =>
      commitBoundedPurchase({
        ...createPurchaseInput(),
        capability: {
          observationId: `sha256:${"0".repeat(64)}`,
          observedAt: "2026-07-13T10:00:00.000Z",
        },
      } as never),
    ).toThrow("capability observation is not authenticated");
  });

  it("snapshots the event before caller mutation", () => {
    const event = createdCapabilityEvent();
    const capability = captureCapabilityEvent(event);
    event.createArgument.agent = "sotto-attacker::1220attacker";
    const result = commitBoundedPurchase({
      ...createPurchaseInput(),
      capability,
    });

    expect(new TextDecoder().decode(result.canonicalBytes)).toContain(
      `"agentParty":"${AGENT}"`,
    );
  });

  it("accepts lossless Daml microsecond time encoding", () => {
    const event = createdCapabilityEvent();
    event.createArgument.expiresAt = "2026-07-13T11:00:00.123000Z";
    const capability = captureCapabilityEvent(event);
    const result = commitBoundedPurchase({
      ...createPurchaseInput(),
      capability,
    });
    expect(new TextDecoder().decode(result.canonicalBytes)).toContain(
      '"expiresAt":"2026-07-13T11:00:00.123Z"',
    );
  });

  it("rejects an invalid Ledger offset", () => {
    expect(() => captureCapabilityEvent(createdCapabilityEvent(), -1)).toThrow(
      "activeAtOffset",
    );
  });

  it("rejects a different contract than the requested capability", async () => {
    const observe = createPurchaseCapabilityObserver(async () => ({
      activeAtOffset: 42,
      createdEvent: createdCapabilityEvent(),
    }));
    await expect(observe("00different")).rejects.toThrow("contractId");
  });

  it("expires a process-local observation after sixty seconds", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-13T10:00:00.000Z"));
      const capability = captureCapabilityEvent();
      vi.advanceTimersByTime(60_001);
      expect(() => readPurchaseCapabilityObservation(capability)).toThrow(
        "stale",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects material wall-clock rollback", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-13T10:00:00.000Z"));
      const capability = captureCapabilityEvent();
      vi.setSystemTime(new Date("2026-07-13T09:59:54.999Z"));
      expect(() => readPurchaseCapabilityObservation(capability)).toThrow(
        "clock moved backwards",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
