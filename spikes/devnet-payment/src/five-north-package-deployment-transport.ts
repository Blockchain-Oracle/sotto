import { randomBytes } from "node:crypto";
import type { SpikeConfig } from "./config.js";
import { approveFiveNorthPrepareNetwork } from "./five-north-prepare-network.js";
import {
  MAX_LEDGER_PACKAGE_BYTES,
  requireLedgerPackageId,
  verifyLedgerPackagePresence,
} from "./five-north-package-presence.js";
import type {
  FiveNorthPackageDeploymentAuthority,
  FiveNorthPackageDeploymentTransport,
} from "./five-north-package-deployment.js";
import {
  requireFiveNorthDarSha256,
  requirePackageDeploymentIdentity,
  requirePackageDeploymentSynchronizer,
} from "./five-north-package-deployment-validation.js";
import {
  parseFiveNorthJson,
  readFiveNorthResponse,
} from "./five-north-response.js";
import { createFiveNorthTokenProvider } from "./five-north-token.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type Options = Readonly<{ fetcher?: Fetcher; signal: AbortSignal }>;
const JSON_RESPONSE_LIMIT = 2_000_000;
const EMPTY_RESPONSE_LIMIT = 65_536;
const AUTHORITY_MAXIMUM_AGE_MS = 60_000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;

function mediaType(response: Response, expected: string): void {
  if (!response.ok) return;
  const actual = response.headers.get("content-type")?.split(";", 1)[0];
  if (actual?.trim().toLowerCase() !== expected) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`Five North response requires ${expected}`);
  }
}

export function createFiveNorthPackageDeploymentTransport(
  candidateNetwork: SpikeConfig["network"],
  options: Options,
): FiveNorthPackageDeploymentTransport {
  const network = approveFiveNorthPrepareNetwork(candidateNetwork);
  const fetcher = options.fetcher ?? fetch;
  const scopeSignal = options.signal;
  if (!(scopeSignal instanceof AbortSignal)) {
    throw new Error("Five North package scope requires an AbortSignal");
  }
  const tokens = createFiveNorthTokenProvider(network, fetcher, scopeSignal);
  const authorities = new WeakMap<
    object,
    {
      authenticatedUserSha256: `sha256:${string}`;
      capturedAt: number;
      darSha256?: string;
      synchronizerId: string;
      used: boolean;
    }
  >();

  function requireActive(): void {
    if (scopeSignal.aborted) {
      throw new Error("Five North package scope cancelled");
    }
  }

  type RequestOptions = Omit<RequestInit, "headers" | "signal"> & {
    headers?: HeadersInit;
  };

  function requestWithToken(init: RequestOptions, token: string): RequestInit {
    requireActive();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return {
      ...init,
      headers,
      signal: AbortSignal.any([scopeSignal, AbortSignal.timeout(30_000)]),
    };
  }

  async function send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetcher(url, init);
    } catch (error) {
      requireActive();
      throw error;
    }
  }

  async function authentication(
    expectedIdentity?: `sha256:${string}`,
  ): Promise<Readonly<{ identity: `sha256:${string}`; token: string }>> {
    requireActive();
    const token = await tokens.accessToken();
    requireActive();
    const identity = requirePackageDeploymentIdentity(token);
    if (expectedIdentity !== undefined && identity !== expectedIdentity) {
      throw new Error("Five North deployment token identity changed");
    }
    return Object.freeze({ identity, token });
  }

  async function authenticatedResponse(
    url: string,
    init: RequestOptions,
    expectedIdentity?: `sha256:${string}`,
  ) {
    let authenticated = await authentication(expectedIdentity);
    let response = await send(url, requestWithToken(init, authenticated.token));
    if (response.status === 401) {
      await response.body?.cancel().catch(() => undefined);
      tokens.invalidate();
      authenticated = await authentication(expectedIdentity);
      response = await send(url, requestWithToken(init, authenticated.token));
    }
    requireActive();
    return Object.freeze({
      authenticatedUserSha256: authenticated.identity,
      response,
    });
  }

  async function readResponse(
    url: string,
    init: RequestOptions,
  ): Promise<Response> {
    return (await authenticatedResponse(url, init)).response;
  }

  async function jsonWithIdentity(url: string) {
    const authenticated = await authenticatedResponse(url, {
      method: "GET",
      redirect: "error",
    });
    const { response } = authenticated;
    mediaType(response, "application/json");
    return Object.freeze({
      authenticatedUserSha256: authenticated.authenticatedUserSha256,
      value: parseFiveNorthJson(
        await readFiveNorthResponse(response, JSON_RESPONSE_LIMIT),
        "Five North package response",
      ),
    });
  }

  async function json(url: string): Promise<unknown> {
    return (await jsonWithIdentity(url)).value;
  }

  function authorityState(authority: unknown) {
    if (typeof authority !== "object" || authority === null) {
      throw new Error("Five North deployment authority is not authenticated");
    }
    const state = authorities.get(authority);
    if (state === undefined) {
      throw new Error("Five North deployment authority is not authenticated");
    }
    const age = Date.now() - state.capturedAt;
    if (age < -CLOCK_ROLLBACK_TOLERANCE_MS) {
      throw new Error("Five North deployment authority clock moved backwards");
    }
    if (age > AUTHORITY_MAXIMUM_AGE_MS) {
      throw new Error("Five North deployment authority is stale");
    }
    return state;
  }

  function darRequest(
    path: string,
    bytes: Uint8Array,
  ): Readonly<{ init: RequestOptions; url: string }> {
    const init: RequestOptions = {
      body: bytes.slice(),
      headers: { "content-type": "application/octet-stream" },
      method: "POST",
      redirect: "error",
    };
    return Object.freeze({
      init,
      url: `${network.ledgerUrl}${path}`,
    });
  }

  async function validateBoundDar(
    path: string,
    bytes: Uint8Array,
    authenticatedUserSha256: `sha256:${string}`,
  ): Promise<Response> {
    const request = darRequest(path, bytes);
    return (
      await authenticatedResponse(
        request.url,
        request.init,
        authenticatedUserSha256,
      )
    ).response;
  }

  return Object.freeze({
    listPackageIds: () => json(`${network.ledgerUrl}/v2/packages`),
    observeDeploymentAuthority: async () => {
      const rules = await jsonWithIdentity(
        `${network.validatorUrl}/v0/scan-proxy/amulet-rules`,
      );
      const capturedAt = Date.now();
      const synchronizerId = requirePackageDeploymentSynchronizer(rules.value);
      const observation = Object.freeze({
        authenticatedUserSha256: rules.authenticatedUserSha256,
        observationId: `sha256:${randomBytes(32).toString("hex")}`,
        observedAt: new Date(capturedAt).toISOString(),
        synchronizerId,
      }) as FiveNorthPackageDeploymentAuthority;
      authorities.set(observation, {
        authenticatedUserSha256: rules.authenticatedUserSha256,
        capturedAt,
        synchronizerId,
        used: false,
      });
      return observation;
    },
    readPackagePresence: async (candidatePackageId) => {
      const packageId = requireLedgerPackageId(candidatePackageId);
      const response = await readResponse(
        `${network.ledgerUrl}/v2/packages/${packageId}`,
        { method: "GET", redirect: "error" },
      );
      mediaType(response, "application/octet-stream");
      if (response.headers.get("canton-package-hash") !== packageId) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error("Ledger package hash header does not match package ID");
      }
      return verifyLedgerPackagePresence(
        await readFiveNorthResponse(response, MAX_LEDGER_PACKAGE_BYTES),
        packageId,
      );
    },
    validateDar: async (bytes, authority) => {
      const state = authorityState(authority);
      const candidateHash = requireFiveNorthDarSha256(bytes);
      if (state.used || state.darSha256 !== undefined) {
        throw new Error("Five North deployment authority is already claimed");
      }
      const response = await validateBoundDar(
        `/v2/dars/validate?synchronizerId=${encodeURIComponent(state.synchronizerId)}`,
        bytes,
        state.authenticatedUserSha256,
      );
      await readFiveNorthResponse(response, EMPTY_RESPONSE_LIMIT);
      state.darSha256 = candidateHash;
    },
    uploadDar: async (bytes, authority, beforeDispatch) => {
      const state = authorityState(authority);
      const candidateHash = requireFiveNorthDarSha256(bytes);
      if (
        typeof beforeDispatch !== "function" ||
        state.used ||
        state.darSha256 === undefined ||
        state.darSha256 !== candidateHash
      ) {
        throw new Error("DAR upload requires one matching validation");
      }
      const authenticated = await authentication(state.authenticatedUserSha256);
      const request = darRequest(
        `/v2/dars?vetAllPackages=false&synchronizerId=${encodeURIComponent(state.synchronizerId)}`,
        bytes,
      );
      const requestInit = requestWithToken(request.init, authenticated.token);
      state.used = true;
      await beforeDispatch();
      const response = await fetcher(request.url, requestInit);
      mediaType(response, "application/json");
      const value = parseFiveNorthJson(
        await readFiveNorthResponse(response, EMPTY_RESPONSE_LIMIT),
        "Five North DAR upload response",
      );
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        Object.keys(value).length !== 0
      ) {
        throw new Error("Five North DAR upload response must be empty");
      }
    },
  });
}
