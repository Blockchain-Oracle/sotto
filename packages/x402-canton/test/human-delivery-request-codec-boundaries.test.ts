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

function envelope(canonical: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(PREFIX.byteLength + 9 + canonical.byteLength);
  bytes.set(PREFIX);
  const view = new DataView(bytes.buffer);
  view.setUint32(PREFIX.byteLength, canonical.byteLength);
  const canonicalOffset = PREFIX.byteLength + 4;
  bytes.set(canonical, canonicalOffset);
  view.setUint32(canonicalOffset + canonical.byteLength + 1, 0);
  return bytes;
}

function exactMaximumBinding() {
  const additionalAuthoritativeHeaders = Array.from(
    { length: 8 },
    (_, index) => `x-pad-${index}`,
  );
  const input = {
    additionalAuthoritativeHeaders,
    body: new Uint8Array(MAX_REQUEST_BODY_BYTES),
    method: "POST",
    url: "https://provider.example/paid/weather",
  } as const;
  const base = commitHttpRequest(input);
  let remaining = MAX_CANONICAL_REQUEST_BYTES - base.canonicalBytes.byteLength;
  const headers = additionalAuthoritativeHeaders.map((name) => {
    const length = Math.min(remaining, 8_192);
    remaining -= length;
    return [name, "x".repeat(length)] as const;
  });
  if (remaining !== 0) throw new Error("test padding cannot reach exact bound");
  return {
    binding: commitHttpRequest({ ...input, headers }),
    body: input.body,
  };
}

describe("private delivery request decoder boundaries", () => {
  it("redacts an invalid private URL from the thrown error object", () => {
    const valid = commitHttpRequest({
      method: "GET",
      url: "https://provider.example/paid/weather",
    });
    const parsed = JSON.parse(
      new TextDecoder().decode(valid.canonicalBytes),
    ) as Record<string, unknown>;
    const secret = "private-query-secret";
    const canonical = new TextEncoder().encode(
      JSON.stringify({ ...parsed, url: `not-a-url?token=${secret}` }),
    );

    let failure: unknown;
    try {
      parseHumanDeliveryRequestPlaintext(envelope(canonical));
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toHaveProperty("input");
    expect(JSON.stringify(failure)).not.toContain(secret);
  });

  it("accepts the exact canonical, body, and total envelope bounds", () => {
    const { binding, body } = exactMaximumBinding();
    const plaintext = encodeHumanDeliveryRequest({
      bindingCanonicalBytes: binding.canonicalBytes,
      body,
    });

    expect(binding.canonicalBytes).toHaveLength(MAX_CANONICAL_REQUEST_BYTES);
    expect(plaintext).toHaveLength(MAX_HUMAN_DELIVERY_REQUEST_BYTES);
    expect(parseHumanDeliveryRequestPlaintext(plaintext).body).toHaveLength(
      MAX_REQUEST_BODY_BYTES,
    );
  });
});
