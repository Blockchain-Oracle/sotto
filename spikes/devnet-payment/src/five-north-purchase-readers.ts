import {
  APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
  type PreparedPurchaseReader,
  type PurchaseCapabilityAcsReader,
  type PurchaseHoldingAcsReader,
  type TransferFactoryRegistryReader,
} from "@sotto/x402-canton";
import type { FiveNorthPrepareTransport } from "./five-north-prepare-transport.js";

const MAX_CAPABILITY_ACS_ENTRIES = 256;

export type FiveNorthPurchaseReaders = Readonly<{
  capability: PurchaseCapabilityAcsReader;
  holdings: PurchaseHoldingAcsReader;
  registry: TransferFactoryRegistryReader;
  prepared: PreparedPurchaseReader;
}>;

function exactIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > 512
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function activeEvent(value: unknown): Record<string, unknown> {
  const entry = objectValue(value, "capability ACS entry");
  const contractEntry = objectValue(
    entry.contractEntry,
    "capability contract entry",
  );
  const active = objectValue(
    contractEntry.JsActiveContract,
    "capability active contract",
  );
  return objectValue(active.createdEvent, "capability created event");
}

export function createFiveNorthPurchaseReaders(
  transport: FiveNorthPrepareTransport,
  payerParty: string,
): FiveNorthPurchaseReaders {
  const payer = exactIdentifier(payerParty, "capability payer Party");
  const capability: PurchaseCapabilityAcsReader = async (contractId) => {
    const requested = exactIdentifier(contractId, "capability contract ID");
    const ledgerEnd = objectValue(
      await transport.readLedgerEnd(),
      "capability ledger end",
    );
    if (
      !Number.isSafeInteger(ledgerEnd.offset) ||
      (ledgerEnd.offset as number) < 0
    ) {
      throw new Error("capability ledger offset is invalid");
    }
    const activeAtOffset = ledgerEnd.offset as number;
    const response = await transport.readActiveContracts({
      filter: {
        filtersByParty: {
          [payer]: {
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
      activeAtOffset,
    });
    if (
      !Array.isArray(response) ||
      response.length > MAX_CAPABILITY_ACS_ENTRIES
    ) {
      throw new Error("capability ACS result exceeds count limit");
    }
    const matches = response
      .map(activeEvent)
      .filter(
        (event) =>
          exactIdentifier(event.contractId, "capability event contract ID") ===
          requested,
      );
    if (matches.length !== 1) {
      throw new Error("capability ACS result must contain exactly one match");
    }
    return Object.freeze({
      activeAtOffset,
      createdEvent: matches[0],
    });
  };

  return Object.freeze({
    capability,
    holdings: Object.freeze({
      readLedgerEnd: transport.readLedgerEnd,
      readActiveContracts: transport.readActiveContracts,
    }),
    registry: transport.readRegistry,
    prepared: transport.readPrepare,
  });
}
