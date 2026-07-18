import { request as requestHttps } from "node:https";
import type { IncomingMessage } from "node:http";
import type { LookupFunction } from "node:net";
import {
  readPublicHttpsTarget,
  type PublicHttpsTarget,
} from "./public-https-target.js";

const MAX_RESPONSE_HEADER_BYTES = 32_768;
const MAX_RESPONSE_HEADER_PAIRS = 128;
const MAX_REQUEST_BODY_BYTES = 1_048_576;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export type PinnedHttpsProbeRequest = Readonly<{
  body?: Uint8Array;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  signal: AbortSignal;
}>;

type HttpsOpener = typeof requestHttps;

function pinnedLookup(
  authority: ReturnType<typeof readPublicHttpsTarget>,
  selected: (typeof authority.addresses)[number],
): LookupFunction {
  return (hostname, options, callback) => {
    if (hostname !== authority.hostname) {
      callback(new Error("catalog HTTPS probe hostname changed"), "", 4);
      return;
    }
    if (options.all) {
      callback(null, [selected]);
      return;
    }
    callback(null, selected.address, selected.family);
  };
}

function boundedHeaders(incoming: IncomingMessage): Headers {
  const raw = incoming.rawHeaders;
  const bytes = raw.reduce(
    (total, value) => total + Buffer.byteLength(value, "utf8") + 2,
    0,
  );
  if (
    raw.length % 2 !== 0 ||
    raw.length / 2 > MAX_RESPONSE_HEADER_PAIRS ||
    bytes > MAX_RESPONSE_HEADER_BYTES
  ) {
    throw new Error("catalog HTTPS probe response headers are invalid");
  }
  let paymentHeaders = 0;
  const headers = new Headers();
  for (let index = 0; index < raw.length; index += 2) {
    const name = raw[index]!;
    const value = raw[index + 1]!;
    if (name.toLowerCase() === "payment-required") paymentHeaders++;
    headers.append(name, value);
  }
  if (paymentHeaders > 1) {
    throw new Error("catalog HTTPS probe payment carrier is ambiguous");
  }
  return headers;
}

function responseFrom(
  incoming: IncomingMessage,
  expectedAddress: string,
): Response {
  const status = incoming.statusCode;
  const remote = incoming.socket.remoteAddress;
  const mappedExpected = `::ffff:${expectedAddress}`;
  if (
    !Number.isInteger(status) ||
    status! < 100 ||
    status! > 599 ||
    (status! >= 300 && status! <= 399) ||
    (remote !== expectedAddress && remote !== mappedExpected)
  ) {
    throw new Error("catalog HTTPS probe response is invalid");
  }
  const validatedStatus = status as number;
  return new Response(null, {
    headers: boundedHeaders(incoming),
    status: validatedStatus,
  });
}

function validateRequest(input: PinnedHttpsProbeRequest) {
  if (
    typeof input !== "object" ||
    input === null ||
    !METHODS.has(input.method) ||
    !(input.signal instanceof AbortSignal) ||
    input.signal.aborted ||
    (input.body !== undefined &&
      (!(input.body instanceof Uint8Array) ||
        input.body.byteLength > MAX_REQUEST_BODY_BYTES)) ||
    ((input.method === "GET" || input.method === "DELETE") &&
      input.body !== undefined)
  ) {
    throw new Error("catalog HTTPS probe request is invalid");
  }
  const body = input.body === undefined ? undefined : Buffer.from(input.body);
  return Object.freeze({ body, method: input.method, signal: input.signal });
}

class RetryableProbeRequestError extends Error {}

function requestAddress(
  authority: ReturnType<typeof readPublicHttpsTarget>,
  selected: (typeof authority.addresses)[number],
  input: ReturnType<typeof validateRequest>,
  openHttps: HttpsOpener,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    let request: ReturnType<HttpsOpener> | undefined;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      input.signal.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () => {
      request?.destroy();
      finish(() => reject(new Error("catalog HTTPS probe interrupted")));
    };
    input.signal.addEventListener("abort", onAbort, { once: true });
    try {
      const options = {
        agent: false,
        autoSelectFamily: false,
        family: selected.family,
        headers: {
          accept: "application/json",
          connection: "close",
          ...(input.body === undefined
            ? {}
            : {
                "content-length": String(input.body.byteLength),
                "content-type": "application/json",
              }),
          "user-agent": "sotto-catalog-probe/1",
        },
        lookup: pinnedLookup(authority, selected),
        maxHeaderSize: MAX_RESPONSE_HEADER_BYTES,
        method: input.method,
        rejectUnauthorized: true,
        servername: authority.hostname,
        signal: input.signal,
      } as const;
      request = openHttps(authority.url, options, (incoming) => {
        try {
          const response = responseFrom(incoming, selected.address);
          incoming.destroy();
          finish(() => resolve(response));
        } catch {
          incoming.destroy();
          finish(() =>
            reject(new Error("catalog HTTPS probe response failed")),
          );
        }
      });
      request.once("error", () =>
        finish(() => reject(new RetryableProbeRequestError())),
      );
      request.end(input.body);
    } catch {
      request?.destroy();
      finish(() => reject(new RetryableProbeRequestError()));
    }
  });
}

export async function requestPinnedHttpsProbe(
  target: PublicHttpsTarget,
  candidate: PinnedHttpsProbeRequest,
  dependencies: Readonly<{ openHttps?: HttpsOpener }> = {},
): Promise<Response> {
  const authority = readPublicHttpsTarget(target);
  const input = validateRequest(candidate);
  const openHttps = dependencies.openHttps ?? requestHttps;
  for (const selected of authority.addresses) {
    if (input.signal.aborted) {
      throw new Error("catalog HTTPS probe interrupted");
    }
    try {
      return await requestAddress(authority, selected, input, openHttps);
    } catch (error) {
      if (input.signal.aborted) {
        throw new Error("catalog HTTPS probe interrupted", { cause: error });
      }
      if (!(error instanceof RetryableProbeRequestError)) throw error;
    }
  }
  throw new Error("catalog HTTPS probe request failed");
}
