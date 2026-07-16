import { describe, expect, it } from "vitest";
import {
  commitBoundedPurchase,
  createPurchaseHoldingObserver,
  readBoundedPurchaseLedgerIntent,
} from "../src/index.js";
import {
  claimPurchaseHoldingObservation,
  readPurchaseHoldingObservation,
} from "../src/purchase-holding-observation.js";
import {
  HOLDING_IMPLEMENTATION_PACKAGE_ID,
  HOLDING_TEMPLATE_PACKAGE_ID,
  authenticatedPurchaseIntent,
  holdingEntry,
  holdingReader,
} from "./purchase-holding-observation.fixtures.js";
import { createPurchaseInput, PAYER } from "./purchase-commitment.fixtures.js";

async function rejectionFor(entry: unknown): Promise<string> {
  const intent = authenticatedPurchaseIntent();
  try {
    await createPurchaseHoldingObserver(holdingReader([entry]))(intent);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected holding observation rejection");
}

describe("purchase holding validation", () => {
  it("accepts the pinned current Five North Holding creation package", async () => {
    const intent = authenticatedPurchaseIntent();
    const observation = await createPurchaseHoldingObserver(
      holdingReader([
        holdingEntry("00current-holding", "0.3250000000", {
          createdEvent: {
            templateId: `${HOLDING_IMPLEMENTATION_PACKAGE_ID}:Splice.Amulet:Amulet`,
          },
        }),
      ]),
    )(intent);

    expect(
      readPurchaseHoldingObservation(observation, intent).contractIds,
    ).toEqual(["00current-holding"]);
  });

  it.each([
    [
      "interface",
      holdingEntry("00holding", "0.3250000000", {
        interfaceView: { interfaceId: "bad:Holding" },
      }),
    ],
    [
      "implementation package",
      holdingEntry("00holding", "0.3250000000", {
        interfaceView: { implementationPackageId: "bad-package" },
      }),
    ],
    [
      "implementation package",
      holdingEntry("00holding", "0.3250000000", {
        interfaceView: {
          implementationPackageId: HOLDING_TEMPLATE_PACKAGE_ID,
        },
      }),
    ],
    [
      "view failed",
      holdingEntry("00holding", "0.3250000000", {
        interfaceView: { viewStatus: { code: 7 } },
      }),
    ],
    [
      "template",
      holdingEntry("00holding", "0.3250000000", {
        createdEvent: { templateId: "bad:Splice.Amulet:Amulet" },
      }),
    ],
    [
      "template",
      holdingEntry("00holding", "0.3250000000", {
        createdEvent: {
          templateId: `${HOLDING_TEMPLATE_PACKAGE_ID}:Other:Holding`,
        },
      }),
    ],
    [
      "packageName",
      holdingEntry("00holding", "0.3250000000", {
        createdEvent: { packageName: "other-package" },
      }),
    ],
    [
      "template",
      holdingEntry("00holding", "0.3250000000", {
        createdEvent: {
          templateId: `${HOLDING_TEMPLATE_PACKAGE_ID}:`,
        },
      }),
    ],
    [
      "base64",
      holdingEntry("00holding", "0.3250000000", {
        createdEvent: { createdEventBlob: "not base64!" },
      }),
    ],
    ["Daml Decimal", holdingEntry("00holding", "00.3250000000")],
    [
      "witness",
      holdingEntry("00holding", "0.3250000000", {
        createdEvent: { witnessParties: ["sotto-other::1220other"] },
      }),
    ],
    [
      "contractEntry keys",
      {
        ...holdingEntry("00holding", "0.3250000000"),
        contractEntry: {
          ...holdingEntry("00holding", "0.3250000000").contractEntry,
          JsIncompleteUnassigned: {},
        },
      },
    ],
  ])("rejects an invalid %s", async (expected, entry) => {
    await expect(rejectionFor(entry)).resolves.toContain(expected);
  });
  it("filters clean ineligible holdings before calculating coverage", async () => {
    const intent = authenticatedPurchaseIntent();
    const observation = await createPurchaseHoldingObserver(
      holdingReader([
        holdingEntry("00wrong-owner", "2.0000000000", {
          viewValue: { owner: "sotto-other::1220other" },
        }),
        holdingEntry("00wrong-instrument", "2.0000000000", {
          viewValue: {
            instrumentId: { admin: "DSO::1220dso", id: "Other" },
          },
        }),
        holdingEntry("00locked", "2.0000000000", {
          viewValue: { lock: { expiresAt: "2026-07-14T00:00:00Z" } },
        }),
        holdingEntry("00zero", "0.0000000000"),
        holdingEntry("00eligible", "0.3250000000"),
      ]),
    )(intent);

    expect(
      readPurchaseHoldingObservation(observation, intent).contractIds,
    ).toEqual(["00eligible"]);
  });
  it("rejects duplicate holding identities", async () => {
    const intent = authenticatedPurchaseIntent();
    await expect(
      createPurchaseHoldingObserver(
        holdingReader([
          holdingEntry("00duplicate", "0.2000000000"),
          holdingEntry("00duplicate", "0.2000000000"),
        ]),
      )(intent),
    ).rejects.toThrow("duplicated");
  });

  it("rejects a duplicate identity even when one copy is ineligible", async () => {
    const intent = authenticatedPurchaseIntent();
    await expect(
      createPurchaseHoldingObserver(
        holdingReader([
          holdingEntry("00duplicate", "0.3250000000"),
          holdingEntry("00duplicate", "2.0000000000", {
            viewValue: { owner: "sotto-other::1220other" },
          }),
        ]),
      )(intent),
    ).rejects.toThrow("duplicated");
  });

  it("rejects when the largest sixteen inputs cannot cover the ceiling", async () => {
    const intent = authenticatedPurchaseIntent();
    const entries = Array.from({ length: 17 }, (_, index) =>
      holdingEntry(
        `00holding-${index.toString().padStart(2, "0")}`,
        "0.0200000000",
      ),
    );
    await expect(
      createPurchaseHoldingObserver(holdingReader(entries))(intent),
    ).rejects.toThrow("do not cover");
  });

  it("rejects oversized ACS responses before parsing metadata", async () => {
    const entry = holdingEntry("00holding", "0.3250000000", {
      viewValue: { meta: { values: { padding: "x".repeat(2_000_000) } } },
    });
    await expect(rejectionFor(entry)).resolves.toContain(
      "response exceeds byte",
    );
  });

  it("rejects a forged handle or reuse by a different purchase", async () => {
    const intent = authenticatedPurchaseIntent();
    const observation = await createPurchaseHoldingObserver(
      holdingReader([holdingEntry("00holding", "0.3250000000")]),
    )(intent);
    const otherIntent = readBoundedPurchaseLedgerIntent(
      commitBoundedPurchase({
        ...createPurchaseInput(),
        authorizationInstanceId: "authorization-8",
      }),
    );

    expect(() =>
      readPurchaseHoldingObservation({ ...observation }, intent),
    ).toThrow("not authenticated");
    expect(() =>
      readPurchaseHoldingObservation(observation, otherIntent),
    ).toThrow("different purchase");
  });

  it("snapshots reader output and returns deeply frozen execution material", async () => {
    const intent = authenticatedPurchaseIntent();
    const entry = holdingEntry("00holding", "0.3250000000");
    const observation = await createPurchaseHoldingObserver(
      holdingReader([entry]),
    )(intent);
    const event = entry.contractEntry.JsActiveContract.createdEvent;
    event.contractId = "00attacker";
    event.createdEventBlob = Buffer.from("attacker").toString("base64");

    const material = claimPurchaseHoldingObservation(observation, intent);
    expect(material.contractIds).toEqual(["00holding"]);
    expect(Object.isFrozen(material)).toBe(true);
    expect(Object.isFrozen(material.contractIds)).toBe(true);
    expect(Object.isFrozen(material.disclosedContracts)).toBe(true);
    expect(Object.isFrozen(material.disclosedContracts[0])).toBe(true);
    expect(JSON.stringify(material)).not.toContain(PAYER);
  });
});
