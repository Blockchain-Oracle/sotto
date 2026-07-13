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
  preferredWalletPackageBody,
  preapprovalStateContractsBody,
  requirePreapprovalReceiverParty,
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
  readAmuletRules: () => Promise<unknown>;
  readAuthenticatedUserId: () => Promise<string>;
  readLedgerEnd: () => Promise<unknown>;
  readCapabilityContracts: (activeAtOffset: number) => Promise<unknown>;
  readHoldingContracts: (activeAtOffset: number) => Promise<unknown>;
  readRegistry: (body: string) => Promise<Uint8Array>;
  readPrepare: (body: BoundedPurchasePrepareRequest) => Promise<Uint8Array>;
  readPreferredWalletPackage: (
    receiverParty: string,
    validatorParty: string,
  ) => Promise<unknown>;
  readPreapprovalStateContracts: (
    receiverParty: string,
  ) => Promise<Readonly<{ activeAtOffset: number; contracts: unknown }>>;
  readTransferPreapproval: (receiverParty: string) => Promise<unknown | null>;
  readValidatorUser: () => Promise<unknown>;
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

  async function authenticatedUserId(): Promise<string> {
    const token = await tokens.accessToken();
    const parts = token.split(".");
    if (parts.length !== 3 || parts[1] === undefined) {
      throw new Error("Five North access token is not a JWT");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    } catch {
      throw new Error("Five North access token payload is invalid");
    }
    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload) ||
      typeof (payload as Record<string, unknown>).sub !== "string" ||
      (payload as { sub: string }).sub.trim() === "" ||
      Buffer.byteLength((payload as { sub: string }).sub, "utf8") > 256
    ) {
      throw new Error("Five North access token subject is invalid");
    }
    return (payload as { sub: string }).sub;
  }

  function requireActive(): void {
    if (scopeSignal.aborted) {
      throw new Error("Five North prepare scope cancelled");
    }
  }

  async function authorizedResponse(
    url: string,
    init: Omit<RequestInit, "headers" | "signal"> & {
      headers?: HeadersInit;
    },
    timeoutMilliseconds: number,
  ): Promise<Response> {
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
    return response;
  }

  async function authorized(
    url: string,
    init: Omit<RequestInit, "headers" | "signal"> & {
      headers?: HeadersInit;
    },
    timeoutMilliseconds: number,
    maximumBytes: number,
  ): Promise<Uint8Array> {
    return readFiveNorthResponse(
      await authorizedResponse(url, init, timeoutMilliseconds),
      maximumBytes,
    );
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

  async function validatorJson(path: string): Promise<unknown> {
    return parseFiveNorthJson(
      await authorized(
        `${network.validatorUrl}${path}`,
        { method: "GET", redirect: "error" },
        30_000,
        JSON_RESPONSE_LIMIT,
      ),
      "Five North validator response",
    );
  }

  async function optionalValidatorJson(path: string): Promise<unknown | null> {
    const response = await authorizedResponse(
      `${network.validatorUrl}${path}`,
      { method: "GET", redirect: "error" },
      30_000,
    );
    if (response.status === 404) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    return parseFiveNorthJson(
      await readFiveNorthResponse(response, JSON_RESPONSE_LIMIT),
      "Five North validator response",
    );
  }

  return Object.freeze({
    readAmuletRules: () => validatorJson("/v0/scan-proxy/amulet-rules"),
    readAuthenticatedUserId: authenticatedUserId,
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
        `${network.validatorUrl}/v0/scan-proxy${TRANSFER_FACTORY_REGISTRY_PATH}`,
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
    readPreferredWalletPackage: (receiverParty, validatorParty) =>
      ledgerJson(
        "/v2/interactive-submission/preferred-packages",
        "POST",
        preferredWalletPackageBody(receiverParty, validatorParty),
      ),
    readPreapprovalStateContracts: async (receiverParty) => {
      const ledgerEnd = await ledgerJson("/v2/state/ledger-end", "GET");
      if (
        typeof ledgerEnd !== "object" ||
        ledgerEnd === null ||
        Array.isArray(ledgerEnd) ||
        !Number.isSafeInteger((ledgerEnd as Record<string, unknown>).offset) ||
        ((ledgerEnd as Record<string, unknown>).offset as number) < 0
      ) {
        throw new Error("preapproval proposal ledger end is invalid");
      }
      const activeAtOffset = (ledgerEnd as { offset: number }).offset;
      const contracts = await ledgerJson(
        "/v2/state/active-contracts",
        "POST",
        preapprovalStateContractsBody(receiverParty, activeAtOffset),
      );
      return Object.freeze({ activeAtOffset, contracts });
    },
    readTransferPreapproval: (receiverParty) =>
      optionalValidatorJson(
        `/v0/scan-proxy/transfer-preapprovals/by-party/${encodeURIComponent(
          requirePreapprovalReceiverParty(receiverParty),
        )}`,
      ),
    readValidatorUser: () => validatorJson("/v0/validator-user"),
  });
}
