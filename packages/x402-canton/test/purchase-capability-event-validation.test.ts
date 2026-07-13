import { describe, expect, it } from "vitest";
import { commitBoundedPurchase } from "../src/index.js";
import {
  captureCapabilityEvent,
  type CapabilityEvent,
  createdCapabilityEvent,
} from "./purchase-capability-observation.fixtures.js";
import { createPurchaseInput, PAYER } from "./purchase-commitment.fixtures.js";

type EventMutation = (event: CapabilityEvent) => void;

const malformedEvents: ReadonlyArray<readonly [string, EventMutation, string]> =
  [
    [
      "negative decimal",
      (event) => (event.createArgument.perCallLimit = "-1.0000000000"),
      "canonical Daml Decimal",
    ],
    [
      "oversized decimal",
      (event) =>
        (event.createArgument.maximumTotalDebit = `${"1".repeat(29)}.0`),
      "canonical Daml Decimal",
    ],
    [
      "invalid revision",
      (event) => (event.createArgument.revision = "01"),
      "bounded integer",
    ],
    [
      "sub-millisecond expiry",
      (event) =>
        (event.createArgument.expiresAt = "2026-07-13T11:00:00.123456Z"),
      "sub-millisecond",
    ],
    [
      "malformed resource hash",
      (event) => (event.createArgument.allowedResourceHash = "bad"),
      "resourceHash",
    ],
    [
      "wrong template",
      (event) =>
        ((event as { templateId: string }).templateId =
          `${"a".repeat(64)}:Other:Template`),
      "templateId",
    ],
    [
      "unapproved package",
      (event) =>
        ((event as { templateId: string }).templateId =
          `${"b".repeat(64)}:Sotto.Control.PurchaseCapability:BoundedPurchaseCapability`),
      "templateId",
    ],
    [
      "wrong package name",
      (event) => (event.packageName = "other-package"),
      "packageName",
    ],
    [
      "wrong signatory metadata",
      (event) => (event.signatories = ["sotto-other::1220party"]),
      "signatories",
    ],
    [
      "wrong observer metadata",
      (event) => (event.observers = ["sotto-other::1220party"]),
      "observers",
    ],
    [
      "missing payload member",
      (event) => {
        delete (event.createArgument as Record<string, unknown>)[
          "allowedRecipient"
        ];
      },
      "createArgument keys",
    ],
  ];

const mismatchedEvents: ReadonlyArray<
  readonly [string, EventMutation, string]
> = [
  ["paused", (event) => (event.createArgument.paused = true), "paused"],
  [
    "payer",
    (event) => {
      event.createArgument.payer = "sotto-other::1220payer";
      event.signatories = [event.createArgument.payer];
    },
    "capability payer",
  ],
  [
    "collapsed agent authority",
    (event) => {
      event.createArgument.agent = PAYER;
      event.observers = [PAYER];
    },
    "agent must differ",
  ],
  [
    "instrument",
    (event) =>
      (event.createArgument.instrumentId = {
        ...event.createArgument.instrumentId,
        id: "Other",
      }),
    "capability instrument",
  ],
  [
    "transfer factory",
    (event) => (event.createArgument.transferFactoryCid = "00otherfactory"),
    "transfer factory",
  ],
  [
    "expected admin",
    (event) => (event.createArgument.expectedAdmin = "Other::1220admin"),
    "expected admin",
  ],
  [
    "maximum debit below per-call limit",
    (event) => (event.createArgument.maximumTotalDebit = "0.2999999999"),
    "cover per-call limit",
  ],
];

describe("purchase capability Ledger event validation", () => {
  it.each(malformedEvents)("rejects %s", (_name, mutate, message) => {
    const event = createdCapabilityEvent();
    mutate(event);
    expect(() => captureCapabilityEvent(event)).toThrow(message);
  });

  it.each(mismatchedEvents)(
    "rejects authenticated %s state before commitment",
    (_name, mutate, message) => {
      const event = createdCapabilityEvent();
      mutate(event);
      const capability = captureCapabilityEvent(event);
      expect(() =>
        commitBoundedPurchase({ ...createPurchaseInput(), capability }),
      ).toThrow(message);
    },
  );
});
