import {
  MAX_PREPARE_RESPONSE_BYTES,
  MAX_REGISTRY_RESPONSE_BYTES,
  PREPARE_SUBMISSION_PATH,
  PREPARE_SUBMISSION_TIMEOUT_MS,
  REGISTRY_TIMEOUT_MS,
  TRANSFER_FACTORY_REGISTRY_PATH,
  type BoundedPurchasePrepareRequest,
} from "@sotto/x402-canton";
import type { SpikeConfig } from "./config.js";
import {
  approveFiveNorthPrepareNetwork,
  requireSottoPayerParty,
} from "./five-north-prepare-network.js";
import {
  boundedPrepareBody,
  capabilityContractsBody,
  holdingContractsBody,
} from "./five-north-prepare-requests.js";
import {
  parseFiveNorthJson,
  readFiveNorthResponse,
} from "./five-north-response.js";
import { createFiveNorthTokenProvider } from "./five-north-token.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type TransportOptions = Readonly<{
  fetcher?: Fetcher;
  signal: AbortSignal;
}>;

const JSON_RESPONSE_LIMIT = 2_000_000;

export type FiveNorthPrepareTransport = Readonly<{
  readLedgerEnd: () => Promise<unknown>;
  readCapabilityContracts: (activeAtOffset: number) => Promise<unknown>;
  readHoldingContracts: (activeAtOffset: number) => Promise<unknown>;
  readRegistry: (body: string) => Promise<Uint8Array>;
  readPrepare: (body: BoundedPurchasePrepareRequest) => Promise<Uint8Array>;
}>;

export function createFiveNorthPrepareTransport(
  candidateNetwork: SpikeConfig["network"],
  candidatePayer: string,
  options: TransportOptions,
): FiveNorthPrepareTransport {
  const network = approveFiveNorthPrepareNetwork(candidateNetwork);
  const payer = requireSottoPayerParty(candidatePayer);
  const fetcher = options.fetcher ?? fetch;
  const scopeSignal = options.signal;
  if (!(scopeSignal instanceof AbortSignal)) {
    throw new Error("Five North prepare scope requires an AbortSignal");
  }
  const tokens = createFiveNorthTokenProvider(network, fetcher, scopeSignal);

  function requireActive(): void {
    if (scopeSignal.aborted) {
      throw new Error("Five North prepare scope cancelled");
    }
  }

  async function authorized(
    url: string,
    init: Omit<RequestInit, "headers" | "signal"> & {
      headers?: HeadersInit;
    },
    timeoutMilliseconds: number,
    maximumBytes: number,
  ): Promise<Uint8Array> {
    async function send(): Promise<Response> {
      requireActive();
      const token = await tokens.accessToken();
      requireActive();
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${token}`);
      try {
        return await fetcher(url, {
          ...init,
          headers,
          signal: AbortSignal.any([
            scopeSignal,
            AbortSignal.timeout(timeoutMilliseconds),
          ]),
        });
      } catch (error) {
        requireActive();
        throw error;
      }
    }
    let response = await send();
    if (response.status === 401) {
      await response.body?.cancel().catch(() => undefined);
      requireActive();
      tokens.invalidate();
      response = await send();
    }
    requireActive();
    return readFiveNorthResponse(response, maximumBytes);
  }

  async function ledgerJson(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
  ): Promise<unknown> {
    const bytes = await authorized(
      `${network.ledgerUrl}${path}`,
      {
        ...(body === undefined
          ? {}
          : {
              body: boundedPrepareBody(body, "Ledger request"),
              headers: { "content-type": "application/json" },
            }),
        method,
        redirect: "error",
      },
      30_000,
      JSON_RESPONSE_LIMIT,
    );
    return parseFiveNorthJson(bytes, "Five North response");
  }

  return Object.freeze({
    readLedgerEnd: () => ledgerJson("/v2/state/ledger-end", "GET"),
    readCapabilityContracts: (activeAtOffset) =>
      ledgerJson(
        "/v2/state/active-contracts",
        "POST",
        capabilityContractsBody(payer, activeAtOffset),
      ),
    readHoldingContracts: (activeAtOffset) =>
      ledgerJson(
        "/v2/state/active-contracts",
        "POST",
        holdingContractsBody(payer, activeAtOffset),
      ),
    readRegistry: (body) =>
      authorized(
        `${network.validatorUrl}${TRANSFER_FACTORY_REGISTRY_PATH}`,
        {
          body: boundedPrepareBody(body, "TransferFactory registry request"),
          headers: { "content-type": "application/json" },
          method: "POST",
          redirect: "error",
        },
        REGISTRY_TIMEOUT_MS,
        MAX_REGISTRY_RESPONSE_BYTES,
      ),
    readPrepare: (body) =>
      authorized(
        `${network.ledgerUrl}${PREPARE_SUBMISSION_PATH}`,
        {
          body: boundedPrepareBody(body, "prepare request"),
          headers: { "content-type": "application/json" },
          method: "POST",
          redirect: "error",
        },
        PREPARE_SUBMISSION_TIMEOUT_MS,
        MAX_PREPARE_RESPONSE_BYTES,
      ),
  });
}
