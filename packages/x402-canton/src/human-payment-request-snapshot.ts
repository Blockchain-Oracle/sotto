import {
  commitHttpRequest,
  MAX_AUTHORITATIVE_HEADERS,
  MAX_RAW_REQUEST_HEADERS,
  MAX_REQUEST_BODY_BYTES,
  type HttpRequestBindingInput,
  type HttpRequestCommitment,
} from "./request-binding.js";
import { hasControlCharacter } from "./purchase-commitment-primitives.js";

const forbiddenTransportHeaders = new Set([
  "authorization",
  "cookie",
  "payment-signature",
  "proxy-authorization",
  "x-payment",
  "x-payment-signature",
]);
const transportHeaderName = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;

function transportHeaders(
  candidate: unknown,
): ReadonlyArray<readonly [string, string]> {
  if (candidate === undefined) return Object.freeze([]);
  if (!Array.isArray(candidate)) {
    throw new Error("human payment transport headers must be an array");
  }
  if (candidate.length > MAX_RAW_REQUEST_HEADERS) {
    throw new Error("Request exceeds 128 raw header tuples");
  }
  return Object.freeze(
    candidate.map((entry) => {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== "string" ||
        typeof entry[1] !== "string"
      ) {
        throw new Error("human payment transport header is invalid");
      }
      const name = entry[0];
      const value = entry[1];
      if (
        !transportHeaderName.test(name) ||
        hasControlCharacter(value) ||
        Buffer.byteLength(value, "utf8") > 8_192
      ) {
        throw new Error("human payment transport header is invalid");
      }
      if (forbiddenTransportHeaders.has(name.toLowerCase())) {
        throw new Error(`forbidden human payment transport header: ${name}`);
      }
      return Object.freeze([name, value] as const);
    }),
  );
}

export function snapshotHumanPaymentRequest(input: HttpRequestBindingInput) {
  const method = input.method;
  const url = input.url;
  const bodyCandidate = input.body;
  const headersCandidate = input.headers;
  const authoritativeCandidate = input.additionalAuthoritativeHeaders;
  if (
    bodyCandidate !== undefined &&
    (!(bodyCandidate instanceof Uint8Array) ||
      bodyCandidate.byteLength > MAX_REQUEST_BODY_BYTES)
  ) {
    throw new Error("Request body exceeds 1048576 bytes");
  }
  if (
    authoritativeCandidate !== undefined &&
    (!Array.isArray(authoritativeCandidate) ||
      authoritativeCandidate.length > MAX_AUTHORITATIVE_HEADERS - 3)
  ) {
    throw new Error("Request exceeds 64 authoritative headers");
  }
  const body =
    bodyCandidate === undefined
      ? undefined
      : bodyCandidate instanceof Uint8Array
        ? Uint8Array.from(bodyCandidate)
        : bodyCandidate;
  const headers = transportHeaders(headersCandidate);
  const additionalAuthoritativeHeaders = Object.freeze([
    ...(authoritativeCandidate ?? []),
  ]);
  const binding = commitHttpRequest({
    ...(body === undefined ? {} : { body }),
    headers,
    additionalAuthoritativeHeaders,
    method,
    url,
  });
  return Object.freeze({
    binding: Object.freeze({
      ...binding,
      canonicalBytes: Uint8Array.from(binding.canonicalBytes),
    }) as HttpRequestCommitment,
    body,
    headers,
    method: method.toUpperCase(),
    url: new URL(url).toString(),
  });
}
