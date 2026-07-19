import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateHumanPurchaseProviderSettlement } from "../src/index.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  child,
  HUMAN_PROVIDER_HOLDING,
  humanProviderSettlementFixture,
  setSettlementValue,
} from "./human-provider-settlement.fixtures.js";

describe("human provider settlement CID security", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("rejects a provider Holding CID that collides with context authority", async () => {
    const { expected, proof, response } =
      await humanProviderSettlementFixture();
    const candidate = structuredClone(response);
    const collision = expected.choiceContextContractIds["featured-app-right"];
    setSettlementValue(
      candidate,
      ["transaction", "events", 1, "CreatedEvent", "contractId"],
      collision,
    );
    setSettlementValue(
      candidate,
      [
        "transaction",
        "events",
        0,
        "ExercisedEvent",
        "exerciseResult",
        "result",
        "createdAmulets",
        0,
        "value",
      ],
      collision,
    );

    expect(() =>
      authenticateHumanPurchaseProviderSettlement(candidate, proof, expected),
    ).toThrow(/did not reconcile/iu);
  });

  it("rejects duplicate CreatedEvent contract IDs across unrelated events", async () => {
    const { expected, proof, response } =
      await humanProviderSettlementFixture();
    const candidate = structuredClone(response);
    const events = child(
      child(candidate, "transaction"),
      "events",
    ) as unknown[];
    events.push({
      CreatedEvent: {
        contractId: HUMAN_PROVIDER_HOLDING,
        createArgument: { owner: "unrelated" },
        templateId: "unrelated",
      },
    });

    expect(() =>
      authenticateHumanPurchaseProviderSettlement(candidate, proof, expected),
    ).toThrow(/did not reconcile/iu);
  });
});
