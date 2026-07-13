import { describe, expect, it, vi } from "vitest";
import {
  APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
  TRANSFER_FACTORY_REGISTRY_PATH,
} from "@sotto/x402-canton";
import { createFiveNorthPurchaseReaders } from "../src/five-north-purchase-readers.js";
import type { FiveNorthPrepareTransport } from "../src/five-north-prepare-transport.js";

const PAYER = "sotto-payer::1220payer";
const CAPABILITY = "00capability";

function activeEntry(contractId = CAPABILITY) {
  return {
    contractEntry: {
      JsActiveContract: {
        createdEvent: {
          contractId,
          templateId: APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
        },
      },
    },
  };
}

function transport(
  activeContracts: unknown = [activeEntry()],
): FiveNorthPrepareTransport {
  return {
    readLedgerEnd: vi.fn(async () => ({ offset: 42 })),
    readActiveContracts: vi.fn(async () => activeContracts),
    readRegistry: vi.fn(async () => new Uint8Array([1, 2, 3])),
    readPrepare: vi.fn(async () => new Uint8Array([4, 5, 6])),
  };
}

describe("Five North purchase readers", () => {
  it("reads one exact payer-visible capability at a stable offset", async () => {
    const source = transport();
    const readers = createFiveNorthPurchaseReaders(source, PAYER);

    await expect(readers.capability(CAPABILITY)).resolves.toEqual({
      activeAtOffset: 42,
      createdEvent: activeEntry().contractEntry.JsActiveContract.createdEvent,
    });
    expect(source.readActiveContracts).toHaveBeenCalledWith({
      filter: {
        filtersByParty: {
          [PAYER]: {
            cumulative: [
              {
                identifierFilter: {
                  TemplateFilter: {
                    value: {
                      templateId:
                        APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
                      includeCreatedEventBlob: false,
                    },
                  },
                },
              },
            ],
          },
        },
      },
      verbose: true,
      activeAtOffset: 42,
    });
  });

  it.each([
    ["missing", []],
    ["duplicate", [activeEntry(), activeEntry()]],
    ["wrong contract", [activeEntry("00other")]],
    ["malformed", [{ contractEntry: {} }]],
  ])("rejects a %s capability result", async (_label, entries) => {
    const readers = createFiveNorthPurchaseReaders(transport(entries), PAYER);
    await expect(readers.capability(CAPABILITY)).rejects.toThrow();
  });

  it("wires only the observer read surfaces", async () => {
    const source = transport();
    const readers = createFiveNorthPurchaseReaders(source, PAYER);
    const registryRequest = {
      body: "{}",
      contentType: "application/json",
      maximumResponseBytes: 2_000_000,
      method: "POST",
      path: TRANSFER_FACTORY_REGISTRY_PATH,
      redirect: "error",
      registryAdmin: "sotto-admin::1220admin",
      timeoutMilliseconds: 10_000,
    } as const;
    const prepareRequest = {
      body: { commandId: "sotto-test" } as never,
      contentType: "application/json",
      maximumResponseBytes: 8_388_608,
      method: "POST",
      path: "/v2/interactive-submission/prepare",
      redirect: "error",
      timeoutMilliseconds: 10_000,
    } as const;

    await expect(readers.holdings.readLedgerEnd()).resolves.toEqual({
      offset: 42,
    });
    await expect(
      readers.holdings.readActiveContracts({
        filter: { filtersByParty: {} },
        verbose: false,
        activeAtOffset: 42,
      }),
    ).resolves.toEqual([activeEntry()]);
    await expect(readers.registry(registryRequest)).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    await expect(readers.prepared(prepareRequest)).resolves.toEqual(
      new Uint8Array([4, 5, 6]),
    );
    expect(Object.keys(readers).sort()).toEqual([
      "capability",
      "holdings",
      "prepared",
      "registry",
    ]);
  });
});
