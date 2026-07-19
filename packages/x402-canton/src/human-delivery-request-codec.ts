import { createHash } from "node:crypto";
import {
  HUMAN_DELIVERY_REQUEST_VERSION,
  MAX_HUMAN_DELIVERY_REQUEST_BYTES,
  type HumanDeliveryRequest,
  type HumanPaymentDeliveryRequest,
} from "./human-delivery-request-types.js";
import {
  MAX_CANONICAL_REQUEST_BYTES,
  MAX_REQUEST_BODY_BYTES,
  REQUEST_BINDING_VERSION,
  type HttpRequestCommitment,
} from "./request-binding.js";
import { validateRequestBindingCanonical } from "./request-binding-validation.js";
import { assertStrictJson } from "./strict-json.js";

const PREFIX = new TextEncoder().encode(`${HUMAN_DELIVERY_REQUEST_VERSION}\0`);
const LENGTH_BYTES = 4;

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function strictCanonicalSource(bytes: Uint8Array): string {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new Error("private delivery request binding is invalid");
  }
  if (source.charCodeAt(0) === 0xfeff) {
    throw new Error("private delivery request binding is invalid");
  }
  assertStrictJson(source);
  return source;
}

function material(
  canonicalBytes: Uint8Array,
  body: Uint8Array,
  bodyPresent: boolean,
): HumanDeliveryRequest {
  const bodySha256 = sha256(body);
  const binding: HttpRequestCommitment = {
    version: REQUEST_BINDING_VERSION,
    bodySha256,
    canonicalBytes,
    commitment: `sha256:${sha256(canonicalBytes)}`,
  };
  const source = strictCanonicalSource(canonicalBytes);
  const request = validateRequestBindingCanonical(
    JSON.parse(source) as unknown,
    source,
    binding,
  );
  const storedBody = Uint8Array.from(body);
  const headers = Object.freeze(
    request.headers
      .filter(({ value }) => value !== "")
      .map(({ name, value }) => Object.freeze([name, value] as const)),
  );
  return Object.freeze({
    version: HUMAN_DELIVERY_REQUEST_VERSION,
    get body() {
      return Uint8Array.from(storedBody);
    },
    bodyPresent,
    bodyHash: `sha256:${bodySha256}`,
    headers,
    method: request.method,
    requestCommitment: binding.commitment,
    url: request.url.toString(),
  });
}

export function encodeHumanDeliveryRequest(
  source: HumanPaymentDeliveryRequest,
): Uint8Array {
  const canonical = Uint8Array.from(source.bindingCanonicalBytes);
  const body = Uint8Array.from(source.body ?? new Uint8Array());
  const bodyPresent = source.body !== undefined;
  if (
    canonical.byteLength < 1 ||
    canonical.byteLength > MAX_CANONICAL_REQUEST_BYTES ||
    body.byteLength > MAX_REQUEST_BODY_BYTES ||
    (bodyPresent && body.byteLength === 0)
  ) {
    throw new Error("private delivery request exceeds its bounds");
  }
  material(canonical, body, bodyPresent);
  const length = PREFIX.byteLength + 9 + canonical.byteLength + body.byteLength;
  if (length > MAX_HUMAN_DELIVERY_REQUEST_BYTES) {
    throw new Error("private delivery request exceeds its bounds");
  }
  const bytes = new Uint8Array(length);
  bytes.set(PREFIX);
  const view = new DataView(bytes.buffer);
  let offset = PREFIX.byteLength;
  view.setUint32(offset, canonical.byteLength);
  offset += LENGTH_BYTES;
  bytes.set(canonical, offset);
  offset += canonical.byteLength;
  bytes[offset++] = bodyPresent ? 1 : 0;
  view.setUint32(offset, body.byteLength);
  offset += LENGTH_BYTES;
  bytes.set(body, offset);
  return bytes;
}

export function parseHumanDeliveryRequestPlaintext(
  candidate: Uint8Array,
): HumanDeliveryRequest {
  if (
    !(candidate instanceof Uint8Array) ||
    candidate.byteLength > MAX_HUMAN_DELIVERY_REQUEST_BYTES ||
    (typeof SharedArrayBuffer !== "undefined" &&
      candidate.buffer instanceof SharedArrayBuffer)
  ) {
    throw new Error("private delivery request plaintext is invalid");
  }
  const bytes = Uint8Array.from(candidate);
  if (
    bytes.byteLength < PREFIX.byteLength + 10 ||
    PREFIX.some((value, index) => bytes[index] !== value)
  ) {
    throw new Error("private delivery request plaintext is invalid");
  }
  const view = new DataView(bytes.buffer);
  let offset = PREFIX.byteLength;
  const canonicalLength = view.getUint32(offset);
  offset += LENGTH_BYTES;
  if (
    canonicalLength < 1 ||
    canonicalLength > MAX_CANONICAL_REQUEST_BYTES ||
    offset + canonicalLength + 5 > bytes.byteLength
  ) {
    throw new Error("private delivery request plaintext is invalid");
  }
  const canonical = bytes.slice(offset, offset + canonicalLength);
  offset += canonicalLength;
  const bodyFlag = bytes[offset++];
  const bodyLength = view.getUint32(offset);
  offset += LENGTH_BYTES;
  if (
    (bodyFlag !== 0 && bodyFlag !== 1) ||
    bodyLength > MAX_REQUEST_BODY_BYTES ||
    offset + bodyLength !== bytes.byteLength ||
    (bodyFlag === 0) !== (bodyLength === 0)
  ) {
    throw new Error("private delivery request plaintext is invalid");
  }
  return material(canonical, bytes.slice(offset), bodyFlag === 1);
}
