import type {
  HumanPaymentFetcher,
  HumanPaymentFetchRequest,
} from "@sotto/x402-canton";
import {
  startCloudflareQuickTunnel,
  type CloudflareQuickTunnel,
} from "./cloudflare-quick-tunnel.js";
import { readinessParty } from "./five-north-capability-readiness-validation.js";
import { createPaidResourceHandler, startPaidProvider } from "./provider.js";

const AMOUNT_ATOMIC = "2500000000";
const HUMAN_WINDOW_SECONDS = 600;
const PAID_PATH = "/paid/weather";
const PROVIDER_CLOSE_TIMEOUT_MS = 5_000;
const READINESS_TIMEOUT_MS = 20_000;
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type ProviderHandle = Readonly<{
  close: () => Promise<void>;
  localUrl: string;
}>;
type StartProvider = (
  input: Readonly<{
    handler: (request: Request) => Promise<Response>;
    port: number;
    resourceUrl: string;
  }>,
) => Promise<ProviderHandle>;
type Dependencies = Readonly<{
  fetcher: Fetcher;
  startProvider: StartProvider;
  startTunnel: typeof startCloudflareQuickTunnel;
}>;

export type FiveNorthHumanProviderSession = Readonly<{
  close: () => Promise<void>;
  fetchAuthorized: HumanPaymentFetcher;
  resourceUrl: string;
}>;

function active(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Five North human provider session cancelled");
  }
}

function delay(signal: AbortSignal, milliseconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Five North human provider session cancelled"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function awaitReadiness(
  fetcher: Fetcher,
  resourceUrl: string,
  signal: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + READINESS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    active(signal);
    try {
      const response = await fetcher(resourceUrl, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(2_000)]),
      });
      const ready =
        response.status === 402 &&
        response.headers.get("PAYMENT-REQUIRED") !== null;
      await response.body?.cancel().catch(() => undefined);
      if (ready) return;
    } catch {
      active(signal);
    }
    await delay(signal, 250);
  }
  throw new Error("Five North human provider tunnel is not reachable");
}

function createUnsignedFetcher(
  fetcher: Fetcher,
  resourceUrl: string,
): HumanPaymentFetcher {
  return async (request: HumanPaymentFetchRequest) => {
    if (
      request.url !== resourceUrl ||
      request.method !== "GET" ||
      request.redirect !== "error" ||
      !(request.signal instanceof AbortSignal) ||
      "body" in request ||
      !Array.isArray(request.headers) ||
      request.headers.length !== 0
    ) {
      throw new Error(
        "read-only human provider request forbids signatures and headers",
      );
    }
    active(request.signal);
    return await fetcher(resourceUrl, {
      headers: new Headers(),
      method: "GET",
      redirect: "error",
      signal: request.signal,
    });
  };
}

async function closeSession(
  provider: ProviderHandle | undefined,
  tunnel: CloudflareQuickTunnel,
): Promise<void> {
  let tunnelError: unknown;
  try {
    await tunnel.close();
  } catch (error) {
    tunnelError = error;
  }
  try {
    if (provider !== undefined) {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (complete: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          complete();
        };
        const timer = setTimeout(
          () => finish(resolve),
          PROVIDER_CLOSE_TIMEOUT_MS,
        );
        void provider.close().then(
          () => finish(resolve),
          (error: unknown) => finish(() => reject(error)),
        );
      });
    }
  } catch (error) {
    if (tunnelError === undefined) throw error;
  }
  if (tunnelError !== undefined) throw tunnelError;
}

export async function startFiveNorthHumanProviderSession(
  input: Readonly<{
    dsoParty: string;
    payerParty: string;
    port: number;
    providerParty: string;
    signal: AbortSignal;
    synchronizerId: string;
  }>,
  dependencies: Dependencies = {
    fetcher: fetch,
    startProvider: startPaidProvider,
    startTunnel: startCloudflareQuickTunnel,
  },
): Promise<FiveNorthHumanProviderSession> {
  if (!(input.signal instanceof AbortSignal)) {
    throw new Error("Five North human provider signal is invalid");
  }
  active(input.signal);
  const payerParty = readinessParty(input.payerParty, "human payer", true);
  const providerParty = readinessParty(
    input.providerParty,
    "human provider",
    true,
  );
  const dsoParty = readinessParty(input.dsoParty, "human DSO");
  const synchronizerId = readinessParty(
    input.synchronizerId,
    "human synchronizer",
  );
  if (new Set([payerParty, providerParty, dsoParty]).size !== 3) {
    throw new Error("human provider Parties must be distinct");
  }
  const tunnel = await dependencies.startTunnel({
    port: input.port,
    signal: input.signal,
  });
  let provider: ProviderHandle | undefined;
  try {
    const resourceUrl = `${tunnel.origin}${PAID_PATH}`;
    const handler = createPaidResourceHandler({
      amount: AMOUNT_ATOMIC,
      assetTransferMethod: "transfer-factory",
      dsoParty,
      maxTimeoutSeconds: HUMAN_WINDOW_SECONDS,
      payerParty,
      providerParty,
      resourceUrl,
      synchronizerId,
      verifySettlement: async () => false,
    });
    provider = await dependencies.startProvider({
      handler,
      port: input.port,
      resourceUrl,
    });
    if (provider.localUrl !== `http://127.0.0.1:${input.port}${PAID_PATH}`) {
      throw new Error("human provider local route does not match");
    }
    await awaitReadiness(dependencies.fetcher, resourceUrl, input.signal);
    let closed: Promise<void> | undefined;
    return Object.freeze({
      resourceUrl,
      fetchAuthorized: createUnsignedFetcher(dependencies.fetcher, resourceUrl),
      close: () => (closed ??= closeSession(provider, tunnel)),
    });
  } catch (error) {
    await closeSession(provider, tunnel);
    throw error;
  }
}
