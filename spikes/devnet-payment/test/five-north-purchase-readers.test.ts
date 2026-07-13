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
    readCapabilityContracts: vi.fn(async () => activeContracts),
    readHoldingContracts: vi.fn(async () => activeContracts),
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
    expect(source.readCapabilityContracts).toHaveBeenCalledWith(42);
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
    const holdingRequest = {
      filter: {
        filtersByParty: {
          [PAYER]: {
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
      verbose: false as const,
      activeAtOffset: 42,
    };
    await expect(
      readers.holdings.readActiveContracts(holdingRequest),
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
    expect(source.readLedgerEnd).toHaveBeenCalledTimes(1);
    expect(source.readHoldingContracts).toHaveBeenCalledWith(42);
    expect(source.readRegistry).toHaveBeenCalledWith("{}");
    expect(source.readPrepare).toHaveBeenCalledWith(prepareRequest.body);
  });

  it("ignores incomplete reassignment entries but rejects malformed active entries", async () => {
    const incomplete = { contractEntry: { JsIncompleteAssigned: {} } };
    const readers = createFiveNorthPurchaseReaders(
      transport([incomplete, activeEntry()]),
      PAYER,
    );
    await expect(readers.capability(CAPABILITY)).resolves.toMatchObject({
      activeAtOffset: 42,
    });

    const malformed = createFiveNorthPurchaseReaders(
      transport([{ contractEntry: { JsActiveContract: null } }]),
      PAYER,
    );
    await expect(malformed.capability(CAPABILITY)).rejects.toThrow();
  });

  it("rejects forged reader envelopes before transport", async () => {
    const source = transport();
    const readers = createFiveNorthPurchaseReaders(source, PAYER);

    await expect(
      readers.registry({
        ...{
          body: "{}",
          contentType: "application/json",
          maximumResponseBytes: 2_000_000,
          method: "POST",
          path: TRANSFER_FACTORY_REGISTRY_PATH,
          redirect: "error",
          registryAdmin: "sotto-admin::1220admin",
          timeoutMilliseconds: 10_000,
        },
        path: "/v0/wallet/tap",
      } as never),
    ).rejects.toThrow(/envelope/i);
    await expect(
      readers.prepared({
        body: { commandId: "sotto-test" },
        contentType: "application/json",
        maximumResponseBytes: 8_388_608,
        method: "POST",
        path: "/v2/interactive-submission/execute",
        redirect: "error",
        timeoutMilliseconds: 10_000,
      } as never),
    ).rejects.toThrow(/envelope/i);
    expect(source.readRegistry).not.toHaveBeenCalled();
    expect(source.readPrepare).not.toHaveBeenCalled();
  });
});
