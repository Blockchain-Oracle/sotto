import type { HumanReconciliationProbeRequest } from "@sotto/purchase-worker";
import type { FiveNorthNetworkConfig } from "../src/network-config.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type RecordedTransportCall = Readonly<{
  body: unknown;
  method: string;
  url: string;
}>;

export type FakeTransportHandlers = Readonly<{
  completions?: (body: Record<string, unknown>) => Response | unknown;
  ledgerEnd?: () => Response | unknown;
  token?: () => Response | unknown;
  transaction?: (body: Record<string, unknown>) => Response | unknown;
}>;

export const FAKE_NETWORK: FiveNorthNetworkConfig = Object.freeze({
  audience: "validator-devnet-m2m",
  clientId: "validator-devnet-m2m",
  clientSecret: "fake-transport-secret",
  issuerUrl: "https://issuer.fake-transport.invalid",
  ledgerUrl: "https://ledger.fake-transport.invalid",
  scope: "daml_ledger_api",
  tokenUrl: "https://token.fake-transport.invalid/",
  validatorUrl: "https://validator.fake-transport.invalid/api/validator",
});

export function fakeJwt(subject: string): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: subject })}.${Buffer.from("fake-signature").toString("base64url")}`;
}

export function fakeProbeRequest(
  overrides: Record<string, unknown> = {},
): HumanReconciliationProbeRequest {
  return Object.freeze({
    beginExclusive: 10,
    commandId: "sotto-human-command-1",
    payerParty: "sotto-payer::1220aa",
    providerParty: "sotto-provider::1220bb",
    submissionId: "sotto-submission-1",
    synchronizerId: "global-domain::1220cc",
    userId: "fake-transport-user",
    ...overrides,
  }) as HumanReconciliationProbeRequest;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function toResponse(value: Response | unknown): Response {
  return value instanceof Response ? value : jsonResponse(value);
}

async function requestBody(init?: RequestInit): Promise<unknown> {
  if (init?.body === undefined || init.body === null) return undefined;
  if (typeof init.body === "string") return JSON.parse(init.body) as unknown;
  if (init.body instanceof URLSearchParams) {
    return Object.fromEntries(init.body.entries());
  }
  throw new Error("fake transport request body is unsupported");
}

export function createFakeFiveNorthFetcher(handlers: FakeTransportHandlers) {
  const calls: RecordedTransportCall[] = [];
  const fetcher: Fetcher = async (url, init) => {
    const method = init?.method ?? "GET";
    const body = await requestBody(init);
    calls.push(Object.freeze({ body, method, url }));
    if (url === FAKE_NETWORK.tokenUrl && method === "POST") {
      const token = handlers.token?.() ?? {
        access_token: fakeJwt(fakeProbeRequest().userId),
        expires_in: 3_600,
      };
      return toResponse(token);
    }
    if (
      url === `${FAKE_NETWORK.ledgerUrl}/v2/state/ledger-end` &&
      method === "GET"
    ) {
      if (handlers.ledgerEnd === undefined) {
        throw new Error("fake transport ledger-end handler is absent");
      }
      return toResponse(handlers.ledgerEnd());
    }
    if (
      url ===
        `${FAKE_NETWORK.ledgerUrl}/v2/commands/completions?limit=1000&stream_idle_timeout_ms=250` &&
      method === "POST"
    ) {
      if (handlers.completions === undefined) {
        throw new Error("fake transport completions handler is absent");
      }
      return toResponse(handlers.completions(body as Record<string, unknown>));
    }
    if (
      url === `${FAKE_NETWORK.ledgerUrl}/v2/updates/transaction-by-id` &&
      method === "POST"
    ) {
      if (handlers.transaction === undefined) {
        throw new Error("fake transport transaction handler is absent");
      }
      return toResponse(handlers.transaction(body as Record<string, unknown>));
    }
    throw new Error(`fake transport route is absent: ${method} ${url}`);
  };
  return { calls, fetcher };
}

export function completionEntry(value: Record<string, unknown>): unknown {
  return { completionResponse: { Completion: { value } } };
}

export function checkpointEntry(offset: number): unknown {
  return {
    completionResponse: { OffsetCheckpoint: { value: { offset } } },
  };
}
