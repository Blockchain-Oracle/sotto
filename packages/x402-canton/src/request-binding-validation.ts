import {
  MAX_AUTHORITATIVE_HEADERS,
  MAX_REQUEST_URL_BYTES,
  REQUEST_BINDING_VERSION,
  type HttpRequestCommitment,
} from "./request-binding.js";
import {
  exactKeys,
  hasControlCharacter,
  objectValue,
  RAW_SHA256_PATTERN,
} from "./purchase-commitment-primitives.js";
import { isForbiddenRequestAuthorityHeader } from "./request-header-policy.js";

const BASE_HEADERS = new Set([
  "content-encoding",
  "content-type",
  "idempotency-key",
]);
const HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Z]+$/;
const HEADER_TOKEN = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/;

export type ValidatedHeader = Readonly<{ name: string; value: string }>;

export type ValidatedRequestBinding = Readonly<{
  headers: ReadonlyArray<ValidatedHeader>;
  method: string;
  url: URL;
}>;

function validateHeaders(value: unknown): ReadonlyArray<ValidatedHeader> {
  if (
    !Array.isArray(value) ||
    value.length < 3 ||
    value.length > MAX_AUTHORITATIVE_HEADERS
  ) {
    throw new Error("request binding headers must contain 3-64 values");
  }
  const headers = value.map((candidate, index) => {
    const header = objectValue(candidate, `request binding headers[${index}]`);
    exactKeys(header, ["name", "value"], `request binding headers[${index}]`);
    const { name, value: headerValue } = header;
    if (
      typeof name !== "string" ||
      !HEADER_TOKEN.test(name) ||
      name.length > 128 ||
      isForbiddenRequestAuthorityHeader(name) ||
      typeof headerValue !== "string" ||
      headerValue.trim() !== headerValue ||
      hasControlCharacter(headerValue) ||
      Buffer.byteLength(headerValue, "utf8") > 8_192
    ) {
      throw new Error("request binding headers are invalid");
    }
    return Object.freeze({ name, value: headerValue });
  });
  const names = headers.map(({ name }) => name);
  if (
    new Set(names).size !== names.length ||
    [...names].sort().some((name, index) => name !== names[index]) ||
    [...BASE_HEADERS].some((name) => !names.includes(name))
  ) {
    throw new Error("request binding headers must be unique and sorted");
  }
  return Object.freeze(headers);
}

export function validateRequestBindingCanonical(
  value: unknown,
  source: string,
  binding: HttpRequestCommitment,
): ValidatedRequestBinding {
  const request = objectValue(value, "request binding canonical value");
  exactKeys(
    request,
    ["bodySha256", "headers", "method", "url", "version"],
    "request binding canonical value",
  );
  if (
    request.version !== REQUEST_BINDING_VERSION ||
    request.version !== binding.version ||
    typeof request.bodySha256 !== "string" ||
    !RAW_SHA256_PATTERN.test(request.bodySha256) ||
    request.bodySha256 !== binding.bodySha256
  ) {
    throw new Error("request binding canonical value is inconsistent");
  }
  if (typeof request.method !== "string" || !HTTP_TOKEN.test(request.method)) {
    throw new Error("request binding method is not canonical");
  }
  if (typeof request.url !== "string") {
    throw new Error("request binding URL is invalid");
  }
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    throw new Error("request binding URL is invalid");
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    url.toString() !== request.url
  ) {
    throw new Error("request binding URL must be canonical HTTPS");
  }
  if (Buffer.byteLength(request.url, "utf8") > MAX_REQUEST_URL_BYTES) {
    throw new Error("request binding URL exceeds 8192 bytes");
  }
  const headers = validateHeaders(request.headers);
  const canonical = JSON.stringify({
    version: REQUEST_BINDING_VERSION,
    method: request.method,
    url: request.url,
    headers,
    bodySha256: request.bodySha256,
  });
  if (source !== canonical) {
    throw new Error("request binding must use the canonical encoding");
  }
  return Object.freeze({ headers, method: request.method, url });
}
