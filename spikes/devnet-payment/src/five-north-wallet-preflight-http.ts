import type { SpikeConfig } from "./config.js";
import { approveFiveNorthPrepareNetwork } from "./five-north-prepare-network.js";
import { boundedPrepareBody } from "./five-north-prepare-requests.js";
import {
  parseFiveNorthJson,
  readFiveNorthResponse,
} from "./five-north-response.js";
import {
  createFiveNorthTokenProvider,
  type FiveNorthTokenProvider,
} from "./five-north-token.js";

const JSON_LIMIT = 2_097_152;
const TIMEOUT_MS = 30_000;
const REACHABLE_HEAD_STATUSES = new Set([200, 204, 400, 405, 415, 422]);
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type Options = Readonly<{
  fetcher?: Fetcher;
  signal: AbortSignal;
  tokenProvider?: FiveNorthTokenProvider;
}>;

export type FiveNorthWalletPreflightHttp = Readonly<{
  getJson: (path: string) => Promise<unknown>;
  headRoute: (path: string) => Promise<boolean>;
  postJson: (path: string, body: unknown) => Promise<unknown>;
  tokenProvider: FiveNorthTokenProvider;
}>;

export function createFiveNorthWalletPreflightHttp(
  candidateNetwork: SpikeConfig["network"],
  options: Options,
): FiveNorthWalletPreflightHttp {
  const network = approveFiveNorthPrepareNetwork(candidateNetwork);
  const fetcher = options.fetcher ?? fetch;
  const signal = options.signal;
  if (!(signal instanceof AbortSignal)) {
    throw new Error("Five North wallet preflight requires an AbortSignal");
  }
  const tokens =
    options.tokenProvider ??
    createFiveNorthTokenProvider(network, fetcher, signal);

  function active(): void {
    if (signal.aborted)
      throw new Error("Five North wallet preflight cancelled");
  }

  async function authorized(
    path: string,
    init: Omit<RequestInit, "headers" | "signal"> & { headers?: HeadersInit },
  ): Promise<Response> {
    async function send(): Promise<Response> {
      active();
      const token = await tokens.accessToken();
      active();
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${token}`);
      try {
        return await fetcher(`${network.ledgerUrl}${path}`, {
          ...init,
          headers,
          signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
        });
      } catch (error) {
        active();
        throw error;
      }
    }
    let response = await send();
    if (response.status === 401) {
      await response.body?.cancel().catch(() => undefined);
      tokens.invalidate();
      response = await send();
    }
    active();
    return response;
  }

  async function json(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
  ): Promise<unknown> {
    const response = await authorized(path, {
      ...(body === undefined
        ? {}
        : {
            body: boundedPrepareBody(body, "wallet preflight request"),
            headers: { "content-type": "application/json" },
          }),
      method,
      redirect: "error",
    });
    return parseFiveNorthJson(
      await readFiveNorthResponse(response, JSON_LIMIT),
      "Five North wallet preflight response",
    );
  }

  return Object.freeze({
    getJson: (path) => json(path, "GET"),
    headRoute: async (path) => {
      const response = await authorized(path, {
        method: "HEAD",
        redirect: "error",
      });
      const reachable = REACHABLE_HEAD_STATUSES.has(response.status);
      await response.body?.cancel().catch(() => undefined);
      return reachable;
    },
    postJson: (path, body) => json(path, "POST", body),
    tokenProvider: tokens,
  });
}
