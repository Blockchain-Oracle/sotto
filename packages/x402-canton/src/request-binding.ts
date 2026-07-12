import { createHash } from "node:crypto";

export const REQUEST_BINDING_VERSION = "sotto-http-request-v1" as const;

const baseHeaders = [
  "content-encoding",
  "content-type",
  "idempotency-key",
] as const;
const ignoredHeaders = new Set(["payment-signature"]);

export type HttpRequestBindingInput = Readonly<{
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

export function commitHttpRequest(
  input: HttpRequestBindingInput,
): HttpRequestCommitment {
  const values = new Map<string, string>();
  for (const [rawName, rawValue] of input.headers ?? []) {
    const name = rawName.toLowerCase();
    if (!ignoredHeaders.has(name)) {
      values.set(name, rawValue.trim());
    }
  }
  const bodySha256 = sha256(input.body ?? new Uint8Array());
  const canonical = JSON.stringify({
    version: REQUEST_BINDING_VERSION,
    method: input.method.toUpperCase(),
    url: new URL(input.url).toString(),
    headers: baseHeaders.map((name) => ({
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
