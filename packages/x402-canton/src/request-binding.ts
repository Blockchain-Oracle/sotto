import { createHash } from "node:crypto";
import { hasControlCharacter } from "./purchase-commitment-primitives.js";
import { isForbiddenRequestAuthorityHeader } from "./request-header-policy.js";

export const REQUEST_BINDING_VERSION = "sotto-http-request-v1" as const;
export const MAX_REQUEST_BODY_BYTES = 1_048_576;
export const MAX_REQUEST_URL_BYTES = 8_192;
export const MAX_RAW_REQUEST_HEADERS = 128;
export const MAX_AUTHORITATIVE_HEADERS = 64;
export const MAX_CANONICAL_REQUEST_BYTES = 65_536;

const baseHeaders = [
  "content-encoding",
  "content-type",
  "idempotency-key",
] as const;
const ignoredHeaders = new Set(["payment-signature"]);
const httpToken = /^[!#$%&'*+\-.^_`|~0-9A-Z]+$/;
const headerToken = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/;

export type HttpRequestBindingInput = Readonly<{
  additionalAuthoritativeHeaders?: ReadonlyArray<string>;
  body?: Uint8Array;
  headers?: ReadonlyArray<readonly [string, string]>;
  method: string;
  url: string;
}>;

export type HttpRequestCommitment = Readonly<{
  bodySha256: string;
  canonicalBytes: Uint8Array;
  commitment: `sha256:${string}`;
  version: typeof REQUEST_BINDING_VERSION;
}>;

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function authoritativeNames(additional: ReadonlyArray<string>): string[] {
  if (additional.length > MAX_AUTHORITATIVE_HEADERS - baseHeaders.length) {
    throw new Error("Request exceeds 64 authoritative headers");
  }
  const names = new Set<string>(baseHeaders);
  for (const rawName of additional) {
    const name = rawName.toLowerCase();
    if (!headerToken.test(name)) {
      throw new Error(`Invalid authoritative header name: ${rawName}`);
    }
    if (isForbiddenRequestAuthorityHeader(name)) {
      throw new Error(`Authoritative header is forbidden: ${name}`);
    }
    if (names.has(name)) {
      throw new Error(`Duplicate authoritative header declaration: ${name}`);
    }
    names.add(name);
  }
  return [...names].sort();
}

export function commitHttpRequest(
  input: HttpRequestBindingInput,
): HttpRequestCommitment {
  if (
    typeof input.url !== "string" ||
    Buffer.byteLength(input.url, "utf8") > MAX_REQUEST_URL_BYTES
  ) {
    throw new Error("Request URL exceeds 8192 bytes");
  }
  if (
    input.body !== undefined &&
    (!(input.body instanceof Uint8Array) ||
      input.body.byteLength > MAX_REQUEST_BODY_BYTES)
  ) {
    throw new Error("Request body exceeds 1048576 bytes");
  }
  if (
    input.headers !== undefined &&
    (!Array.isArray(input.headers) ||
      input.headers.length > MAX_RAW_REQUEST_HEADERS)
  ) {
    throw new Error("Request exceeds 128 raw header tuples");
  }
  if (
    input.additionalAuthoritativeHeaders !== undefined &&
    !Array.isArray(input.additionalAuthoritativeHeaders)
  ) {
    throw new Error("Request authoritative headers must be an array");
  }
  const method = input.method.toUpperCase();
  if (!httpToken.test(method)) {
    throw new Error(`Invalid HTTP method: ${input.method}`);
  }
  const url = new URL(input.url);
  if (url.protocol !== "https:") {
    throw new Error("Canonical request URL must use HTTPS");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("Canonical request URL must not contain userinfo");
  }
  if (url.hash !== "") {
    throw new Error("Canonical request URL must not contain a fragment");
  }
  if (Buffer.byteLength(url.toString(), "utf8") > MAX_REQUEST_URL_BYTES) {
    throw new Error("Request URL exceeds 8192 bytes");
  }

  const names = authoritativeNames(input.additionalAuthoritativeHeaders ?? []);
  const authoritative = new Set(names);
  const values = new Map<string, string>();
  for (const [rawName, rawValue] of input.headers ?? []) {
    const name = rawName.toLowerCase();
    if (authoritative.has(name)) {
      if (values.has(name)) {
        throw new Error(`Duplicate authoritative header value: ${name}`);
      }
      const value = rawValue.trim();
      if (
        hasControlCharacter(value) ||
        Buffer.byteLength(value, "utf8") > 8_192
      ) {
        throw new Error(`Invalid authoritative header value: ${name}`);
      }
      values.set(name, value);
    } else if (!ignoredHeaders.has(name)) {
      continue;
    }
  }
  const bodySha256 = sha256(input.body ?? new Uint8Array());
  const canonical = JSON.stringify({
    version: REQUEST_BINDING_VERSION,
    method,
    url: url.toString(),
    headers: names.map((name) => ({
      name,
      value: values.get(name) ?? "",
    })),
    bodySha256,
  });
  const canonicalBytes = new TextEncoder().encode(canonical);
  if (canonicalBytes.byteLength > MAX_CANONICAL_REQUEST_BYTES) {
    throw new Error("canonical request exceeds 65536 bytes");
  }
  return {
    bodySha256,
    canonicalBytes,
    commitment: `sha256:${sha256(canonicalBytes)}`,
    version: REQUEST_BINDING_VERSION,
  };
}
