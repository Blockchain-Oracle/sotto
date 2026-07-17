import { request as requestHttps } from "node:https";
import type { LookupFunction } from "node:net";
import { readPublicCloudflareIpv4 } from "./cloudflare-quick-tunnel-resolution.js";
import type { ResolvedCloudflareQuickTunnel } from "./cloudflare-quick-tunnel-resolution.js";
import { parseCloudflareQuickTunnelOrigin } from "./cloudflare-quick-tunnel.js";

const MAXIMUM_RESPONSE_HEADER_BYTES = 32_768;
const MAXIMUM_RESPONSE_HEADER_PAIRS = 128;
const MAXIMUM_PAYMENT_HEADER_BYTES = 16_384;
const PAID_RESOURCE_PATH = "/paid/weather";

export type PinnedHttpsInput = Readonly<{
  address: string;
  family: 4;
  signal: AbortSignal;
  url: URL;
}>;

type PinnedHttpsRequester = (input: PinnedHttpsInput) => Promise<Response>;

function pinnedLookup(input: PinnedHttpsInput): LookupFunction {
  return (hostname, options, callback) => {
    if (hostname !== input.url.hostname) {
      callback(new Error("Cloudflare TLS hostname changed"), "", 4);
      return;
    }
    if (options.all) {
      callback(null, [{ address: input.address, family: input.family }]);
      return;
    }
    callback(null, input.address, input.family);
  };
}

function responseHeaders(raw: string[]): Headers {
  if (
    raw.length % 2 !== 0 ||
    raw.length / 2 > MAXIMUM_RESPONSE_HEADER_PAIRS ||
    Buffer.byteLength(raw.join(""), "utf8") > MAXIMUM_RESPONSE_HEADER_BYTES
  ) {
    throw new Error("Cloudflare response headers exceed limits");
  }
  const paymentHeaders = raw.filter(
    (entry, index) =>
      index % 2 === 0 && entry.toLowerCase() === "payment-required",
  );
  const paymentIndex = raw.findIndex(
    (entry, index) =>
      index % 2 === 0 && entry.toLowerCase() === "payment-required",
  );
  const paymentValue = raw[paymentIndex + 1];
  if (
    paymentHeaders.length !== 1 ||
    paymentValue === undefined ||
    paymentValue === "" ||
    Buffer.byteLength(paymentValue, "utf8") > MAXIMUM_PAYMENT_HEADER_BYTES
  ) {
    throw new Error("Cloudflare PAYMENT-REQUIRED header is invalid");
  }
  const headers = new Headers();
  for (let index = 0; index < raw.length; index += 2) {
    headers.append(raw[index]!, raw[index + 1]!);
  }
  return headers;
}

export async function requestPinnedCloudflareHttps(
  input: PinnedHttpsInput,
  dependencies: Readonly<{ openHttps: typeof requestHttps }> = {
    openHttps: requestHttps,
  },
): Promise<Response> {
  return await new Promise<Response>((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      complete();
    };
    const options = {
      agent: false,
      autoSelectFamily: false,
      family: 4,
      lookup: pinnedLookup(input),
      maxHeaderSize: MAXIMUM_RESPONSE_HEADER_BYTES,
      method: "GET",
      rejectUnauthorized: true,
      servername: input.url.hostname,
      signal: input.signal,
    } as const;
    const request = dependencies.openHttps(input.url, options, (incoming) => {
      try {
        const status = incoming.statusCode;
        if (status !== 402) {
          throw new Error("Cloudflare response status is invalid");
        }
        const headers = responseHeaders(incoming.rawHeaders);
        incoming.destroy();
        finish(() => resolve(new Response(null, { headers, status })));
      } catch {
        incoming.destroy();
        finish(() => reject(new Error("Cloudflare HTTPS response failed")));
      }
    });
    request.once("error", () =>
      finish(() => reject(new Error("Cloudflare HTTPS request failed"))),
    );
    request.end();
  });
}

function exactEmptyHeaders(value: HeadersInit | undefined): boolean {
  return value === undefined || [...new Headers(value)].length === 0;
}

export function createPinnedCloudflareFetcher(
  tunnel: ResolvedCloudflareQuickTunnel,
  resourceUrl: string,
  dependencies: Readonly<{ requestHttps: PinnedHttpsRequester }> = {
    requestHttps: requestPinnedCloudflareHttps,
  },
): (url: string, init?: RequestInit) => Promise<Response> {
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
    throw new Error("Cloudflare pinned route is invalid");
  }
  return async (url, init = {}) => {
    const target = new URL(url);
    if (
      target.href !== approved.href ||
      (init.method ?? "GET") !== "GET" ||
      init.redirect !== "error" ||
      !(init.signal instanceof AbortSignal) ||
      init.signal.aborted ||
      !exactEmptyHeaders(init.headers) ||
      "body" in init
    ) {
      throw new Error("Cloudflare pinned request is not approved");
    }
    return await dependencies.requestHttps({
      address,
      family: 4,
      signal: init.signal,
      url: target,
    });
  };
}
