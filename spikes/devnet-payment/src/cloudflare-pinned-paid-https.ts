import { request as requestHttps } from "node:https";
import type { LookupFunction } from "node:net";
import { readPublicCloudflareIpv4 } from "./cloudflare-quick-tunnel-resolution.js";
import { parseCloudflareQuickTunnelOrigin } from "./cloudflare-quick-tunnel.js";
import {
  encodeSettlementProof,
  parseSettlementProofHeader,
} from "./provider-settlement-proof.js";

const MAXIMUM_RESPONSE_BODY_BYTES = 2_000_000;
const MAXIMUM_RESPONSE_HEADER_BYTES = 32_768;
const MAXIMUM_RESPONSE_HEADER_PAIRS = 128;
const PAID_RESOURCE_PATH = "/paid/weather";

export type PinnedCloudflarePaidHttpsInput = Readonly<{
  address: string;
  family: 4;
  paymentSignature: string;
  signal: AbortSignal;
  url: URL;
}>;

function pinnedLookup(input: PinnedCloudflarePaidHttpsInput): LookupFunction {
  return (hostname, options, callback) => {
    if (hostname !== input.url.hostname) {
      callback(new Error("Cloudflare paid TLS hostname changed"), "", 4);
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
    throw new Error("Cloudflare paid response headers exceed limits");
  }
  const headers = new Headers();
  for (let index = 0; index < raw.length; index += 2) {
    headers.append(raw[index]!, raw[index + 1]!);
  }
  const declared = headers.get("content-length");
  if (declared !== null) {
    if (!/^(?:0|[1-9]\d*)$/u.test(declared)) {
      throw new Error("Cloudflare paid content-length is invalid");
    }
    const bytes = Number(declared);
    if (!Number.isSafeInteger(bytes) || bytes > MAXIMUM_RESPONSE_BODY_BYTES) {
      throw new Error("Cloudflare paid response body exceeds limits");
    }
  }
  return headers;
}

function validateInput(input: PinnedCloudflarePaidHttpsInput): void {
  const origin = parseCloudflareQuickTunnelOrigin(input.url.origin);
  const canonicalProof = encodeSettlementProof(
    parseSettlementProofHeader(input.paymentSignature),
  );
  if (
    input.family !== 4 ||
    readPublicCloudflareIpv4(input.address) !== input.address ||
    input.url.origin !== origin ||
    input.url.pathname !== PAID_RESOURCE_PATH ||
    input.url.username !== "" ||
    input.url.password !== "" ||
    input.url.search !== "" ||
    input.url.hash !== "" ||
    !(input.signal instanceof AbortSignal) ||
    input.signal.aborted ||
    canonicalProof !== input.paymentSignature
  ) {
    throw new Error("Cloudflare paid HTTPS input is invalid");
  }
}

export async function requestPinnedCloudflarePaidHttps(
  input: PinnedCloudflarePaidHttpsInput,
  dependencies: Readonly<{ openHttps: typeof requestHttps }> = {
    openHttps: requestHttps,
  },
): Promise<Response> {
  validateInput(input);
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
      headers: { "PAYMENT-SIGNATURE": input.paymentSignature },
      lookup: pinnedLookup(input),
      maxHeaderSize: MAXIMUM_RESPONSE_HEADER_BYTES,
      method: "GET",
      rejectUnauthorized: true,
      servername: input.url.hostname,
      signal: input.signal,
    } as const;
    const request = dependencies.openHttps(input.url, options, (incoming) => {
      const chunks: Uint8Array[] = [];
      let total = 0;
      const fail = () => {
        incoming.destroy();
        finish(() =>
          reject(new Error("Cloudflare paid HTTPS response failed")),
        );
      };
      try {
        if (incoming.statusCode !== 200) throw new Error("status");
        const headers = responseHeaders(incoming.rawHeaders);
        incoming.on("data", (chunk: unknown) => {
          if (!(chunk instanceof Uint8Array)) return fail();
          total += chunk.byteLength;
          if (total > MAXIMUM_RESPONSE_BODY_BYTES) return fail();
          chunks.push(Buffer.from(chunk));
        });
        incoming.once("aborted", fail);
        incoming.once("error", fail);
        incoming.once("end", () => {
          const declared = headers.get("content-length");
          if (declared !== null && Number(declared) !== total) return fail();
          finish(() =>
            resolve(
              new Response(Buffer.concat(chunks, total), {
                headers,
                status: 200,
              }),
            ),
          );
        });
      } catch {
        fail();
      }
    });
    request.once("error", () =>
      finish(() => reject(new Error("Cloudflare paid HTTPS request failed"))),
    );
    request.end();
  });
}
