import {
  HOLDING_INTERFACE_QUERY_ID,
  MAX_PREPARE_RESPONSE_BYTES,
  MAX_REGISTRY_RESPONSE_BYTES,
  PREPARE_SUBMISSION_PATH,
  PREPARE_SUBMISSION_TIMEOUT_MS,
  REGISTRY_TIMEOUT_MS,
  TRANSFER_FACTORY_REGISTRY_PATH,
  type PreparedPurchaseReader,
  type PurchaseCapabilityAcsReader,
  type PurchaseHoldingAcsReader,
  type PurchaseHoldingAcsRequest,
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

function activeEventOrUndefined(
  value: unknown,
): Record<string, unknown> | undefined {
  const entry = objectValue(value, "capability ACS entry");
  const contractEntry = objectValue(
    entry.contractEntry,
    "capability contract entry",
  );
  if (!("JsActiveContract" in contractEntry)) return undefined;
  return activeEvent(value);
}

function holdingRequest(payer: string, activeAtOffset: number): unknown {
  return {
    filter: {
      filtersByParty: {
        [payer]: {
          cumulative: [
            {
              identifierFilter: {
                InterfaceFilter: {
                  value: {
                    interfaceId: HOLDING_INTERFACE_QUERY_ID,
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
    activeAtOffset,
  };
}

function requireEnvelope(condition: boolean, label: string): asserts condition {
  if (!condition) throw new Error(`${label} envelope is not approved`);
}

export function createFiveNorthPurchaseReaders(
  transport: FiveNorthPrepareTransport,
  payerParty: string,
): FiveNorthPurchaseReaders {
  const payer = exactIdentifier(payerParty, "capability payer Party");
  let offsetPromise: Promise<number> | undefined;
  const stableOffset = (): Promise<number> => {
    offsetPromise ??= (async () => {
      const ledgerEnd = objectValue(
        await transport.readLedgerEnd(),
        "purchase ledger end",
      );
      if (
        !Number.isSafeInteger(ledgerEnd.offset) ||
        (ledgerEnd.offset as number) < 0
      ) {
        throw new Error("purchase ledger offset is invalid");
      }
      return ledgerEnd.offset as number;
    })();
    return offsetPromise;
  };
  const capability: PurchaseCapabilityAcsReader = async (contractId) => {
    const requested = exactIdentifier(contractId, "capability contract ID");
    const activeAtOffset = await stableOffset();
    const response = await transport.readCapabilityContracts(activeAtOffset);
    if (
      !Array.isArray(response) ||
      response.length > MAX_CAPABILITY_ACS_ENTRIES
    ) {
      throw new Error("capability ACS result exceeds count limit");
    }
    const matches = response
      .map(activeEventOrUndefined)
      .filter((event): event is Record<string, unknown> => event !== undefined)
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
      readLedgerEnd: async () => ({ offset: await stableOffset() }),
      readActiveContracts: async (request: PurchaseHoldingAcsRequest) => {
        const activeAtOffset = await stableOffset();
        requireEnvelope(
          JSON.stringify(request) ===
            JSON.stringify(holdingRequest(payer, activeAtOffset)),
          "holding ACS",
        );
        return transport.readHoldingContracts(activeAtOffset);
      },
    }),
    registry: async (request) => {
      requireEnvelope(
        request.path === TRANSFER_FACTORY_REGISTRY_PATH &&
          request.method === "POST" &&
          request.contentType === "application/json" &&
          request.redirect === "error" &&
          request.timeoutMilliseconds === REGISTRY_TIMEOUT_MS &&
          request.maximumResponseBytes === MAX_REGISTRY_RESPONSE_BYTES,
        "TransferFactory registry",
      );
      return transport.readRegistry(request.body);
    },
    prepared: async (request) => {
      requireEnvelope(
        request.path === PREPARE_SUBMISSION_PATH &&
          request.method === "POST" &&
          request.contentType === "application/json" &&
          request.redirect === "error" &&
          request.timeoutMilliseconds === PREPARE_SUBMISSION_TIMEOUT_MS &&
          request.maximumResponseBytes === MAX_PREPARE_RESPONSE_BYTES,
        "prepare",
      );
      return transport.readPrepare(request.body);
    },
  });
}
