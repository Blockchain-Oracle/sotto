import type {
  HumanPaymentFetcher,
  HumanPaymentFetchRequest,
} from "@sotto/x402-canton";
import { createPinnedCloudflareFetcher } from "./cloudflare-pinned-fetch.js";
import { startCloudflareQuickTunnel } from "./cloudflare-quick-tunnel.js";
import {
  acquireResolvableCloudflareQuickTunnel,
  type CloudflareTunnelOriginResolver,
} from "./cloudflare-quick-tunnel-resolution.js";
import { readinessParty } from "./five-north-capability-readiness-validation.js";
import { closeFiveNorthHumanProviderResources } from "./five-north-human-provider-cleanup.js";
import { createPaidResourceHandler, startPaidProvider } from "./provider.js";

const AMOUNT_ATOMIC = "2500000000";
const HUMAN_WINDOW_SECONDS = 600;
const PAID_PATH = "/paid/weather";
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
type CreatePinnedFetcher = typeof createPinnedCloudflareFetcher;
type Dependencies = Readonly<{
  createPinnedFetcher: CreatePinnedFetcher;
  resolveOrigin?: CloudflareTunnelOriginResolver;
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
    createPinnedFetcher: createPinnedCloudflareFetcher,
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
  const tunnel = await acquireResolvableCloudflareQuickTunnel(
    { port: input.port, signal: input.signal },
    dependencies.startTunnel,
    dependencies.resolveOrigin,
  );
  let provider: ProviderHandle | undefined;
  try {
    const resourceUrl = `${tunnel.origin}${PAID_PATH}`;
    const fetcher = dependencies.createPinnedFetcher(tunnel, resourceUrl);
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
    await awaitReadiness(fetcher, resourceUrl, input.signal);
    let closed: Promise<void> | undefined;
    return Object.freeze({
      resourceUrl,
      fetchAuthorized: createUnsignedFetcher(fetcher, resourceUrl),
      close: () =>
        (closed ??= closeFiveNorthHumanProviderResources(provider, tunnel)),
    });
  } catch (error) {
    await closeFiveNorthHumanProviderResources(provider, tunnel);
    throw error;
  }
}
