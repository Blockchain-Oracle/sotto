import { createHash } from "node:crypto";
import { hasControlCharacter } from "./purchase-commitment-primitives.js";

export const REQUEST_BINDING_VERSION = "sotto-http-request-v1" as const;

const baseHeaders = [
  "content-encoding",
  "content-type",
  "idempotency-key",
] as const;
const ignoredHeaders = new Set(["payment-signature"]);
const forbiddenHeaders = new Set([
  "authorization",
  "cookie",
  "payment-signature",
  "proxy-authorization",
  "x-payment",
  "x-payment-signature",
]);
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
  const names = new Set<string>(baseHeaders);
  for (const rawName of additional) {
    const name = rawName.toLowerCase();
    if (!headerToken.test(name)) {
      throw new Error(`Invalid authoritative header name: ${rawName}`);
    }
    if (forbiddenHeaders.has(name)) {
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
  return {
    bodySha256,
    canonicalBytes,
    commitment: `sha256:${sha256(canonicalBytes)}`,
    version: REQUEST_BINDING_VERSION,
  };
}
