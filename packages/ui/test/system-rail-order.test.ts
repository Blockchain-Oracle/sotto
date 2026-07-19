import { describe, expect, it } from "vitest";
import {
  orderRailEvents,
  resolveFreshSounds,
  type RailEvent,
} from "../src/primitives/system-rail.js";

const t = (seconds: number): Date =>
  new Date(Date.UTC(2026, 6, 19, 14, 3, seconds));

describe("orderRailEvents", () => {
  it("orders committed events chronologically, pending after", () => {
    const events: RailEvent[] = [
      { key: "delivery", label: "Delivery", kind: "pending" },
      { key: "settlement", label: "Settlement", at: t(15), kind: "settlement" },
      { key: "challenge", label: "402 challenge", at: t(0), kind: "mark" },
    ];
    expect(orderRailEvents(events).map((event) => event.key)).toEqual([
      "challenge",
      "settlement",
      "delivery",
    ]);
  });

  it("is stable for ties and preserves pending order", () => {
    const events: RailEvent[] = [
      { key: "a", label: "A", at: t(5), kind: "mark" },
      { key: "b", label: "B", at: t(5), kind: "mark" },
      { key: "p1", label: "P1", kind: "pending" },
      { key: "p2", label: "P2", kind: "pending" },
    ];
    expect(orderRailEvents(events).map((event) => event.key)).toEqual([
      "a",
      "b",
      "p1",
      "p2",
    ]);
  });
});

describe("resolveFreshSounds", () => {
  it("marks only newly committed events as fresh", () => {
    const events: RailEvent[] = [
      { key: "challenge", label: "402 challenge", at: t(0), kind: "mark" },
      { key: "settlement", label: "Settlement", at: t(15), kind: "settlement" },
      { key: "delivery", label: "Delivery", kind: "pending" },
    ];
    const fresh = resolveFreshSounds(new Set(["challenge"]), events);
    expect([...fresh]).toEqual(["settlement"]);
  });

  it("never sounds pending events", () => {
    const events: RailEvent[] = [
      { key: "delivery", label: "Delivery", kind: "pending" },
    ];
    expect(resolveFreshSounds(new Set(), events).size).toBe(0);
  });
});
