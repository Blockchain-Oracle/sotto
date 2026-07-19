import {
  HOLDING_INTERFACE_QUERY_ID,
  HUMAN_PREPARE_SUBMISSION_PATH,
  HUMAN_PREPARE_SUBMISSION_TIMEOUT_MS,
  MAX_PREPARE_RESPONSE_BYTES,
  MAX_REGISTRY_RESPONSE_BYTES,
  REGISTRY_TIMEOUT_MS,
  TRANSFER_FACTORY_REGISTRY_PATH,
  type HumanPreparedPurchaseReader,
  type HumanPurchaseHoldingReader,
  type HumanTransferFactoryRegistryReader,
  type PurchaseHoldingAcsRequest,
} from "@sotto/x402-canton";
import type { FiveNorthPrepareTransport } from "./five-north-prepare-transport.js";

export type FiveNorthHumanPurchaseReaders = Readonly<{
  holdings: HumanPurchaseHoldingReader;
  registry: HumanTransferFactoryRegistryReader;
  prepared: HumanPreparedPurchaseReader;
}>;

function identifier(value: unknown, label: string): string {
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

function active(signal: unknown): asserts signal is AbortSignal {
  if (!(signal instanceof AbortSignal)) {
    throw new Error("human Five North read signal is invalid");
  }
  if (signal.aborted) throw new Error("human Five North read cancelled");
}

function ledgerOffset(value: unknown): number {
  const offset =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>).offset
      : undefined;
  if (!Number.isSafeInteger(offset) || (offset as number) < 0) {
    throw new Error("human Five North Ledger offset is invalid");
  }
  return offset as number;
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

function exactEnvelope(condition: boolean, label: string): void {
  if (!condition) throw new Error(`${label} envelope is not approved`);
}

export function createFiveNorthHumanPurchaseReaders(
  transport: FiveNorthPrepareTransport,
  candidatePayer: string,
): FiveNorthHumanPurchaseReaders {
  const payer = identifier(candidatePayer, "human Five North payer Party");
  const holdings: HumanPurchaseHoldingReader = Object.freeze({
    readLedgerEnd: async ({ signal }) => {
      active(signal);
      const offset = ledgerOffset(await transport.readLedgerEnd(signal));
      active(signal);
      return Object.freeze({ offset });
    },
    readActiveContracts: async (
      request: PurchaseHoldingAcsRequest,
      { signal },
    ) => {
      active(signal);
      exactEnvelope(
        JSON.stringify(request) ===
          JSON.stringify(holdingRequest(payer, request.activeAtOffset)),
        "human holding ACS",
      );
      const result = await transport.readHoldingContracts(
        request.activeAtOffset,
        signal,
      );
      active(signal);
      return result;
    },
  });
  const registry: HumanTransferFactoryRegistryReader = async (
    request,
    { signal },
  ) => {
    active(signal);
    exactEnvelope(
      request.path === TRANSFER_FACTORY_REGISTRY_PATH &&
        request.method === "POST" &&
        request.contentType === "application/json" &&
        request.redirect === "error" &&
        request.timeoutMilliseconds === REGISTRY_TIMEOUT_MS &&
        request.maximumResponseBytes === MAX_REGISTRY_RESPONSE_BYTES,
      "human TransferFactory registry",
    );
    const result = await transport.readRegistry(request.body, signal);
    active(signal);
    return result;
  };
  const prepared: HumanPreparedPurchaseReader = async (request, { signal }) => {
    active(signal);
    exactEnvelope(
      request.path === HUMAN_PREPARE_SUBMISSION_PATH &&
        request.method === "POST" &&
        request.contentType === "application/json" &&
        request.redirect === "error" &&
        request.timeoutMilliseconds === HUMAN_PREPARE_SUBMISSION_TIMEOUT_MS &&
        request.maximumResponseBytes === MAX_PREPARE_RESPONSE_BYTES,
      "human prepare",
    );
    const result = await transport.readPrepare(request.body, signal);
    active(signal);
    return result;
  };
  return Object.freeze({ holdings, prepared, registry });
}
