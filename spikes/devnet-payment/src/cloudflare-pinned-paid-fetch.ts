import { readPublicCloudflareIpv4 } from "./cloudflare-quick-tunnel-resolution.js";
import type { ResolvedCloudflareQuickTunnel } from "./cloudflare-quick-tunnel-resolution.js";
import { parseCloudflareQuickTunnelOrigin } from "./cloudflare-quick-tunnel.js";
import {
  encodeSettlementProof,
  parseSettlementProofHeader,
} from "./provider-settlement-proof.js";
import {
  requestPinnedCloudflarePaidHttps,
  type PinnedCloudflarePaidHttpsInput,
} from "./cloudflare-pinned-paid-https.js";

export { requestPinnedCloudflarePaidHttps };
export type { PinnedCloudflarePaidHttpsInput };

const PAID_RESOURCE_PATH = "/paid/weather";
const PAID_RETRY_TIMEOUT_MS = 10_000;

export type PinnedCloudflarePaidRequest = Readonly<{
  headers: readonly [readonly ["PAYMENT-SIGNATURE", string]];
  method: "GET";
  redirect: "error";
  signal: AbortSignal;
}>;

type PaidHttpsRequester = (
  input: PinnedCloudflarePaidHttpsInput,
) => Promise<Response>;

function exactRequest(value: unknown): value is PinnedCloudflarePaidRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const request = value as Record<string, unknown>;
  if (
    JSON.stringify(Object.keys(request).sort()) !==
      JSON.stringify(["headers", "method", "redirect", "signal"]) ||
    request.method !== "GET" ||
    request.redirect !== "error" ||
    !(request.signal instanceof AbortSignal) ||
    request.signal.aborted ||
    !Array.isArray(request.headers) ||
    request.headers.length !== 1
  ) {
    return false;
  }
  const header = request.headers[0];
  return (
    Array.isArray(header) &&
    header.length === 2 &&
    header[0] === "PAYMENT-SIGNATURE" &&
    typeof header[1] === "string"
  );
}

function canonicalPaymentSignature(value: string): string {
  const canonical = encodeSettlementProof(parseSettlementProofHeader(value));
  if (canonical !== value) {
    throw new Error("Cloudflare paid request proof is not canonical");
  }
  return canonical;
}

function boundedPaidRequest(
  requestHttps: PaidHttpsRequester,
  input: PinnedCloudflarePaidHttpsInput,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      input.signal.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () =>
      finish(() => reject(new Error("Cloudflare paid request interrupted")));
    input.signal.addEventListener("abort", onAbort, { once: true });
    if (input.signal.aborted) return onAbort();
    try {
      void requestHttps(input).then(
        (response) => finish(() => resolve(response)),
        (error: unknown) => finish(() => reject(error)),
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

export function createPinnedCloudflarePaidFetcher(
  tunnel: ResolvedCloudflareQuickTunnel,
  resourceUrl: string,
  dependencies: Readonly<{
    requestHttps?: PaidHttpsRequester;
    timeoutSignal?: (milliseconds: number) => AbortSignal;
  }> = {},
) {
  const address = readPublicCloudflareIpv4(tunnel.address);
  const parsedOrigin = parseCloudflareQuickTunnelOrigin(tunnel.origin);
  const origin = new URL(parsedOrigin);
  const approved = new URL(resourceUrl);
  if (
    tunnel.family !== 4 ||
    origin.origin !== parsedOrigin ||
    approved.origin !== origin.origin ||
    approved.pathname !== PAID_RESOURCE_PATH ||
    approved.username !== "" ||
    approved.password !== "" ||
    approved.search !== "" ||
    approved.hash !== ""
  ) {
    throw new Error("Cloudflare pinned paid route is invalid");
  }
  const requestHttps =
    dependencies.requestHttps ?? requestPinnedCloudflarePaidHttps;
  const timeoutSignal = dependencies.timeoutSignal ?? AbortSignal.timeout;
  return async (url: string, request: PinnedCloudflarePaidRequest) => {
    const target = new URL(url);
    if (target.href !== approved.href || !exactRequest(request)) {
      throw new Error("Cloudflare pinned paid request is not approved");
    }
    const paymentSignature = canonicalPaymentSignature(request.headers[0][1]);
    const signal = AbortSignal.any([
      request.signal,
      timeoutSignal(PAID_RETRY_TIMEOUT_MS),
    ]);
    return await boundedPaidRequest(requestHttps, {
      address,
      family: 4,
      paymentSignature,
      signal,
      url: target,
    });
  };
}
