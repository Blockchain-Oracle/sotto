import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateHumanPurchaseProviderSettlement } from "../src/index.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  child,
  humanProviderSettlementFixture,
} from "./human-provider-settlement.fixtures.js";

describe("human provider settlement event envelopes", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each([
    ["incomplete create", { CreatedEvent: { contractId: "00unrelated" } }],
    ["empty exercise", { ExercisedEvent: {} }],
  ])("rejects an %s event", async (_label, extraEvent) => {
    const { expected, proof, response } =
      await humanProviderSettlementFixture();
    const candidate = structuredClone(response);
    const events = child(
      child(candidate, "transaction"),
      "events",
    ) as unknown[];
    events.push(extraEvent);

    expect(() =>
      authenticateHumanPurchaseProviderSettlement(candidate, proof, expected),
    ).toThrow(/did not reconcile/iu);
  });
});
