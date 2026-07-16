import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanPurchaseHoldingObserver } from "../src/index.js";
import { readHumanPurchaseHoldingObservation } from "../src/human-purchase-holding-observation.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  authenticatedHumanPurchaseIntent,
  humanHoldingEntry,
  humanHoldingReader,
} from "./human-purchase-holding.fixtures.js";

function holdingView(entry: ReturnType<typeof humanHoldingEntry>) {
  return entry.contractEntry.JsActiveContract.createdEvent.interfaceViews[0]!
    .viewValue;
}

describe("policy-free human holding validation", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("filters ineligible holdings without accepting identity collisions", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    const wrongOwner = humanHoldingEntry("00wrong-owner", "2.0000000000");
    holdingView(wrongOwner).owner = "sotto-other::1220other";
    const wrongSynchronizer = humanHoldingEntry(
      "00wrong-synchronizer",
      "2.0000000000",
    );
    wrongSynchronizer.contractEntry.JsActiveContract.synchronizerId =
      "other-domain::1220other";
    const observation = await createHumanPurchaseHoldingObserver(
      humanHoldingReader([
        wrongOwner,
        wrongSynchronizer,
        humanHoldingEntry("00eligible", "0.3250000000"),
      ]),
    )(intent);
    expect(
      readHumanPurchaseHoldingObservation(observation, intent).contractIds,
    ).toEqual(["00eligible"]);

    const conflicting = humanHoldingEntry("00duplicate", "2.0000000000");
    holdingView(conflicting).owner = "sotto-other::1220other";
    await expect(
      createHumanPurchaseHoldingObserver(
        humanHoldingReader([
          humanHoldingEntry("00duplicate", "0.3250000000"),
          conflicting,
        ]),
      )(intent),
    ).rejects.toThrow(/duplicated/iu);
  });

  it("accepts exact sixteen-input coverage and rejects a required seventeenth", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    const exactSixteen = Array.from({ length: 16 }, (_, index) =>
      humanHoldingEntry(
        `00exact-${index.toString().padStart(2, "0")}`,
        "0.0203125000",
      ),
    );
    const observation = await createHumanPurchaseHoldingObserver(
      humanHoldingReader(exactSixteen),
    )(intent);
    expect(
      readHumanPurchaseHoldingObservation(observation, intent).contractIds,
    ).toHaveLength(16);

    const needsSeventeen = Array.from({ length: 17 }, (_, index) =>
      humanHoldingEntry(
        `00small-${index.toString().padStart(2, "0")}`,
        "0.0200000000",
      ),
    );
    await expect(
      createHumanPurchaseHoldingObserver(humanHoldingReader(needsSeventeen))(
        intent,
      ),
    ).rejects.toThrow(/do not cover/iu);
  });

  it("uses byte-ordinal ordering for equal values", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    const observation = await createHumanPurchaseHoldingObserver(
      humanHoldingReader([
        humanHoldingEntry("00holding-ä", "0.2000000000"),
        humanHoldingEntry("00holding-z", "0.2000000000"),
        humanHoldingEntry("00holding-a", "0.2000000000"),
      ]),
    )(intent);
    expect(
      readHumanPurchaseHoldingObservation(observation, intent).contractIds,
    ).toEqual(["00holding-a", "00holding-z"]);
  });

  it("snapshots mutable reader output before returning authority", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    const entry = humanHoldingEntry("00holding", "0.3250000000");
    const observation = await createHumanPurchaseHoldingObserver(
      humanHoldingReader([entry]),
    )(intent);
    const event = entry.contractEntry.JsActiveContract.createdEvent;
    event.contractId = "00attacker";
    event.createdEventBlob = Buffer.from("private-attacker").toString("base64");

    const material = readHumanPurchaseHoldingObservation(observation, intent);
    expect(material.contractIds).toEqual(["00holding"]);
    expect(JSON.stringify(material)).not.toContain("attacker");
    expect(Object.isFrozen(material.disclosedContracts[0])).toBe(true);
  });

  it("rejects a parsed ACS response beyond the bounded selector limit", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    const oversized = humanHoldingEntry("00holding", "0.3250000000");
    holdingView(oversized).meta = {
      values: { privatePadding: "x".repeat(2_000_000) },
    };

    await expect(
      createHumanPurchaseHoldingObserver(humanHoldingReader([oversized]))(
        intent,
      ),
    ).rejects.toThrow(/response exceeds byte limit/iu);
  });
});
