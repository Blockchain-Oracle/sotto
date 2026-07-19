import {
  HUMAN_PREPARE_SUBMISSION_PATH,
  HUMAN_PREPARE_SUBMISSION_TIMEOUT_MS,
  MAX_PREPARE_RESPONSE_BYTES,
  TRANSFER_FACTORY_REGISTRY_PATH,
} from "@sotto/x402-canton";
import { describe, expect, it, vi } from "vitest";
import type { FiveNorthPrepareTransport } from "../src/five-north-prepare-transport.js";
import { createFiveNorthHumanPurchaseReaders } from "../src/five-north-human-purchase-readers.js";

const PAYER = "sotto-external-payer::1220payer";

function transport(): FiveNorthPrepareTransport {
  return {
    readAmuletRules: vi.fn(async () => ({})),
    readAuthenticatedUserId: vi.fn(async () => "ledger-user-6"),
    readLedgerEnd: vi.fn(async () => ({ offset: 42 })),
    readCapabilityContracts: vi.fn(async () => []),
    readHoldingContracts: vi.fn(async () => []),
    readPreferredWalletPackage: vi.fn(async () => ({})),
    readPreapprovalStateContracts: vi.fn(async () => ({
      activeAtOffset: 42,
      contracts: [],
    })),
    readTransferPreapproval: vi.fn(async () => null),
    readValidatorUser: vi.fn(async () => ({})),
    readRegistry: vi.fn(async () => new Uint8Array([1, 2, 3])),
    readPrepare: vi.fn(async () => new Uint8Array([4, 5, 6])),
  };
}

describe("Five North human purchase readers", () => {
  it("forwards only exact observer-approved envelopes and operation signals", async () => {
    const source = transport();
    const readers = createFiveNorthHumanPurchaseReaders(source, PAYER);
    const controller = new AbortController();
    const options = Object.freeze({ signal: controller.signal });

    await expect(readers.holdings.readLedgerEnd(options)).resolves.toEqual({
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
      readers.holdings.readActiveContracts(holdingRequest, options),
    ).resolves.toEqual([]);
    await expect(
      readers.registry(
        {
          body: "{}",
          contentType: "application/json",
          maximumResponseBytes: 2_000_000,
          method: "POST",
          path: TRANSFER_FACTORY_REGISTRY_PATH,
          redirect: "error",
          registryAdmin: "DSO::1220dso",
          timeoutMilliseconds: 10_000,
        },
        options,
      ),
    ).resolves.toEqual(new Uint8Array([1, 2, 3]));
    await expect(
      readers.prepared(
        {
          body: { commandId: "sotto-human-purchase-v1-test" } as never,
          contentType: "application/json",
          maximumResponseBytes: MAX_PREPARE_RESPONSE_BYTES,
          method: "POST",
          path: HUMAN_PREPARE_SUBMISSION_PATH,
          redirect: "error",
          timeoutMilliseconds: HUMAN_PREPARE_SUBMISSION_TIMEOUT_MS,
        },
        options,
      ),
    ).resolves.toEqual(new Uint8Array([4, 5, 6]));

    expect(source.readLedgerEnd).toHaveBeenCalledWith(controller.signal);
    expect(source.readHoldingContracts).toHaveBeenCalledWith(
      42,
      controller.signal,
    );
    expect(source.readRegistry).toHaveBeenCalledWith("{}", controller.signal);
    expect(source.readPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ commandId: "sotto-human-purchase-v1-test" }),
      controller.signal,
    );
  });

  it("rejects forged envelopes and aborted operations before transport", async () => {
    const source = transport();
    const readers = createFiveNorthHumanPurchaseReaders(source, PAYER);
    const controller = new AbortController();
    controller.abort("private caller reason");

    await expect(
      readers.holdings.readLedgerEnd({ signal: controller.signal }),
    ).rejects.toThrow("human Five North read cancelled");
    await expect(
      readers.prepared(
        {
          body: { commandId: "forged" },
          contentType: "application/json",
          maximumResponseBytes: MAX_PREPARE_RESPONSE_BYTES,
          method: "POST",
          path: "/v2/interactive-submission/execute",
          redirect: "error",
          timeoutMilliseconds: HUMAN_PREPARE_SUBMISSION_TIMEOUT_MS,
        } as never,
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow(/envelope/iu);
    expect(source.readLedgerEnd).not.toHaveBeenCalled();
    expect(source.readPrepare).not.toHaveBeenCalled();
  });
});
