import type {
  PreparedPurchaseTransportRequest,
  TransferFactoryRegistryRequest,
} from "@sotto/x402-canton";
import type { SpikeConfig } from "./config.js";
import {
  parseFiveNorthJson,
  readFiveNorthResponse,
} from "./five-north-response.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const JSON_RESPONSE_LIMIT = 2_000_000;
const TOKEN_RESPONSE_LIMIT = 65_536;

export type FiveNorthPrepareTransport = Readonly<{
  readLedgerEnd: () => Promise<unknown>;
  readActiveContracts: (body: unknown) => Promise<unknown>;
  readRegistry: (
    request: TransferFactoryRegistryRequest,
  ) => Promise<Uint8Array>;
  readPrepare: (
    request: PreparedPurchaseTransportRequest,
  ) => Promise<Uint8Array>;
}>;

export function createFiveNorthPrepareTransport(
  network: SpikeConfig["network"],
  fetcher: Fetcher = fetch,
): FiveNorthPrepareTransport {
  let cachedToken: Promise<string> | undefined;

  async function accessToken(): Promise<string> {
    cachedToken ??= (async () => {
      const response = await fetcher(network.tokenUrl, {
        body: new URLSearchParams({
          audience: network.audience,
          client_id: network.clientId,
          client_secret: network.clientSecret,
          grant_type: "client_credentials",
          scope: network.scope,
        }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      const payload = parseFiveNorthJson(
        await readFiveNorthResponse(response, TOKEN_RESPONSE_LIMIT),
        "OIDC response",
      );
      if (
        typeof payload !== "object" ||
        payload === null ||
        Array.isArray(payload) ||
        typeof (payload as Record<string, unknown>).access_token !== "string"
      ) {
        throw new Error("OIDC response requires access_token");
      }
      return (payload as Record<string, string>).access_token!;
    })();
    return cachedToken;
  }

  async function authorized(
    url: string,
    init: RequestInit,
    maximumBytes: number,
  ): Promise<Uint8Array> {
    const token = await accessToken();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return readFiveNorthResponse(
      await fetcher(url, { ...init, headers }),
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
              body: JSON.stringify(body),
              headers: { "content-type": "application/json" },
            }),
        method,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      },
      JSON_RESPONSE_LIMIT,
    );
    return parseFiveNorthJson(bytes, "Five North response");
  }

  return Object.freeze({
    readLedgerEnd: () => ledgerJson("/v2/state/ledger-end", "GET"),
    readActiveContracts: (body: unknown) =>
      ledgerJson("/v2/state/active-contracts", "POST", body),
    readRegistry: (request: TransferFactoryRegistryRequest) =>
      authorized(
        `${network.validatorUrl}${request.path}`,
        {
          body: request.body,
          headers: { "content-type": request.contentType },
          method: request.method,
          redirect: request.redirect,
          signal: AbortSignal.timeout(request.timeoutMilliseconds),
        },
        request.maximumResponseBytes,
      ),
    readPrepare: (request: PreparedPurchaseTransportRequest) =>
      authorized(
        `${network.ledgerUrl}${request.path}`,
        {
          body: JSON.stringify(request.body),
          headers: { "content-type": request.contentType },
          method: request.method,
          redirect: request.redirect,
          signal: AbortSignal.timeout(request.timeoutMilliseconds),
        },
        request.maximumResponseBytes,
      ),
  });
}
