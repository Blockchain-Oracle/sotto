import { describe, expect, it } from "vitest";
import {
  encodeHumanDeliveryRequest,
  parseHumanDeliveryRequestPlaintext,
} from "../src/human-delivery-request-codec.js";
import {
  HUMAN_DELIVERY_REQUEST_VERSION,
  MAX_HUMAN_DELIVERY_REQUEST_BYTES,
} from "../src/human-delivery-request-types.js";
import {
  commitHttpRequest,
  MAX_CANONICAL_REQUEST_BYTES,
  MAX_REQUEST_BODY_BYTES,
} from "../src/request-binding.js";

const PREFIX = new TextEncoder().encode(`${HUMAN_DELIVERY_REQUEST_VERSION}\0`);
const BODY_SECRET = new TextEncoder().encode("private-codec-secret");

function validPlaintext(body = BODY_SECRET): Uint8Array {
  const binding = commitHttpRequest({
    body,
    headers: [["content-type", "application/octet-stream"]],
    method: "POST",
    url: "https://provider.example/paid/weather?private=query",
  });
  return encodeHumanDeliveryRequest({
    bindingCanonicalBytes: binding.canonicalBytes,
    body,
  });
}

function parts(plaintext = validPlaintext()) {
  const view = new DataView(
    plaintext.buffer,
    plaintext.byteOffset,
    plaintext.byteLength,
  );
  const canonicalLength = view.getUint32(PREFIX.byteLength);
  const canonicalOffset = PREFIX.byteLength + 4;
  const flagOffset = canonicalOffset + canonicalLength;
  return {
    body: plaintext.slice(flagOffset + 5),
    canonical: plaintext.slice(canonicalOffset, flagOffset),
    flagOffset,
  };
}

function envelope(
  canonical: Uint8Array,
  body: Uint8Array,
  bodyFlag = body.byteLength === 0 ? 0 : 1,
): Uint8Array {
  const bytes = new Uint8Array(
    PREFIX.byteLength + 9 + canonical.length + body.length,
  );
  bytes.set(PREFIX);
  const view = new DataView(bytes.buffer);
  view.setUint32(PREFIX.byteLength, canonical.length);
  const canonicalOffset = PREFIX.byteLength + 4;
  bytes.set(canonical, canonicalOffset);
  const flagOffset = canonicalOffset + canonical.length;
  bytes[flagOffset] = bodyFlag;
  view.setUint32(flagOffset + 1, body.length);
  bytes.set(body, flagOffset + 5);
  return bytes;
}

function expectInvalid(candidate: Uint8Array): void {
  expect(() => parseHumanDeliveryRequestPlaintext(candidate)).toThrow();
}

describe("private delivery request decoder hardening", () => {
  it.each([0, PREFIX.byteLength - 2, PREFIX.byteLength - 1])(
    "rejects a mutated version/prefix byte at %i",
    (index) => {
      const candidate = validPlaintext();
      candidate[index] = candidate[index]! ^ 1;
      expectInvalid(candidate);
    },
  );

  it.each([0, MAX_CANONICAL_REQUEST_BYTES + 1])(
    "rejects forged canonical length %i",
    (length) => {
      const candidate = validPlaintext();
      new DataView(candidate.buffer).setUint32(PREFIX.byteLength, length);
      expectInvalid(candidate);
    },
  );

  it("rejects canonical length shifts across the body flag boundary", () => {
    const original = validPlaintext();
    const canonicalLength = parts(original).canonical.byteLength;
    for (const length of [canonicalLength - 1, canonicalLength + 1]) {
      const candidate = Uint8Array.from(original);
      new DataView(candidate.buffer).setUint32(PREFIX.byteLength, length);
      expectInvalid(candidate);
    }
  });

  it.each([2, 255])("rejects invalid body flag %i", (flag) => {
    const candidate = validPlaintext();
    const { flagOffset } = parts(candidate);
    candidate[flagOffset] = flag;
    expectInvalid(candidate);
  });

  it("rejects forged, oversized, and flag-inconsistent body lengths", () => {
    const candidate = validPlaintext();
    const { canonical, flagOffset } = parts(candidate);
    const forged = Uint8Array.from(candidate);
    new DataView(forged.buffer).setUint32(
      flagOffset + 1,
      BODY_SECRET.length + 1,
    );
    expectInvalid(forged);
    const oversized = Uint8Array.from(candidate);
    new DataView(oversized.buffer).setUint32(
      flagOffset + 1,
      MAX_REQUEST_BODY_BYTES + 1,
    );
    expectInvalid(oversized);
    expectInvalid(envelope(canonical, new Uint8Array(), 1));
    expectInvalid(envelope(canonical, BODY_SECRET, 0));
  });

  it("rejects BOM-prefixed and malformed UTF-8 canonical JSON", () => {
    const { body, canonical } = parts();
    expectInvalid(
      envelope(Uint8Array.from([0xef, 0xbb, 0xbf, ...canonical]), body),
    );
    const malformed = Uint8Array.from(canonical);
    malformed[0] = 0xff;
    expectInvalid(envelope(malformed, body));
  });

  it("rejects duplicate keys and noncanonical JSON ordering", () => {
    const { body, canonical } = parts();
    const source = new TextDecoder().decode(canonical);
    const duplicate = source.replace(
      "{",
      `{"version":"${HUMAN_DELIVERY_REQUEST_VERSION}",`,
    );
    expectInvalid(envelope(new TextEncoder().encode(duplicate), body));
    const escapedDuplicate = source.replace(
      "{",
      `{"versi\\u006fn":"${HUMAN_DELIVERY_REQUEST_VERSION}",`,
    );
    expectInvalid(envelope(new TextEncoder().encode(escapedDuplicate), body));
    const parsed = JSON.parse(source) as Record<string, unknown>;
    const reordered = JSON.stringify({
      method: parsed.method,
      version: parsed.version,
      url: parsed.url,
      headers: parsed.headers,
      bodySha256: parsed.bodySha256,
    });
    expectInvalid(envelope(new TextEncoder().encode(reordered), body));
    const reversedHeaders = JSON.stringify({
      version: parsed.version,
      method: parsed.method,
      url: parsed.url,
      headers: [...(parsed.headers as unknown[])].reverse(),
      bodySha256: parsed.bodySha256,
    });
    expectInvalid(envelope(new TextEncoder().encode(reversedHeaders), body));
  });

  it("accepts the exact body bound and rejects the envelope plus-one bound", () => {
    const exact = validPlaintext(new Uint8Array(MAX_REQUEST_BODY_BYTES));
    expect(parseHumanDeliveryRequestPlaintext(exact).body).toHaveLength(
      MAX_REQUEST_BODY_BYTES,
    );
    expectInvalid(new Uint8Array(MAX_HUMAN_DELIVERY_REQUEST_BYTES + 1));
  });
});
