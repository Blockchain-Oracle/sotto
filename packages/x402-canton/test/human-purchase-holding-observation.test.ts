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
import { HUMAN_PAYER } from "./human-payer-identity.fixtures.js";
import {
  authenticatedHumanPurchaseIntent,
  humanHoldingEntry,
} from "./human-purchase-holding.fixtures.js";

describe("policy-free human holding observation", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("queries only the authenticated payer and selects the committed debit ceiling", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    const readLedgerEnd = vi.fn<HumanPurchaseHoldingReader["readLedgerEnd"]>(
      async () => ({ offset: 42 }),
    );
    const readActiveContracts = vi.fn<
      HumanPurchaseHoldingReader["readActiveContracts"]
    >(async () => [
      humanHoldingEntry("00human-c", "0.0200000000"),
      humanHoldingEntry("00human-b", "0.1500000000"),
      humanHoldingEntry("00human-a", "0.2000000000"),
    ]);
    const reader = {
      readActiveContracts,
      readLedgerEnd,
    } satisfies HumanPurchaseHoldingReader;

    const observation =
      await createHumanPurchaseHoldingObserver(reader)(intent);

    const ledgerOptions = readLedgerEnd.mock.calls[0]![0];
    const [request, contractOptions] = readActiveContracts.mock.calls[0]!;
    expect(ledgerOptions.signal).toBeInstanceOf(AbortSignal);
    expect(contractOptions.signal).toBe(ledgerOptions.signal);
    expect(request).toEqual({
      filter: {
        filtersByParty: {
          [HUMAN_PAYER]: {
            cumulative: [
              {
                identifierFilter: {
                  InterfaceFilter: {
                    value: {
                      interfaceId:
                        "#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding",
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
    expect(observation.observationId).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(JSON.stringify(observation)).not.toContain(HUMAN_PAYER);

    const material = readHumanPurchaseHoldingObservation(observation, intent);
    expect(material.contractIds).toEqual(["00human-a", "00human-b"]);
    expect(material.attemptId).toBe(intent.attemptId);
    expect(material.purchaseCommitment).toBe(intent.purchaseCommitment);
    expect(Object.isFrozen(material)).toBe(true);
    expect(Object.isFrozen(material.contractIds)).toBe(true);
    expect(Object.isFrozen(material.disclosedContracts)).toBe(true);

    expect(
      claimHumanPurchaseHoldingObservation(observation, intent).contractIds,
    ).toEqual(["00human-a", "00human-b"]);
    expect(() =>
      readHumanPurchaseHoldingObservation(observation, intent),
    ).toThrow(/already claimed/iu);
  });

  it("rejects an intent look-alike before any Ledger read", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    const readLedgerEnd = vi.fn();
    const observe = createHumanPurchaseHoldingObserver({
      readLedgerEnd,
      readActiveContracts: vi.fn(),
    });

    await expect(observe(structuredClone(intent))).rejects.toThrow(
      /intent is not authenticated/iu,
    );
    expect(readLedgerEnd).not.toHaveBeenCalled();
  });
});
