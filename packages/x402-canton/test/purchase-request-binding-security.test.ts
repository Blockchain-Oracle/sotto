import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  commitBoundedPurchase,
  commitHttpRequest,
  type BoundedPurchaseCommitmentInput,
  type HttpRequestCommitment,
} from "../src/index.js";
import {
  createPurchaseInput,
  mutateChallenge,
} from "./purchase-commitment.fixtures.js";

type CanonicalRequest = {
  bodySha256: string;
  headers: Array<{ name: string; value: string }>;
  method: string;
  url: string;
  version: string;
};
type CanonicalMutation = (value: CanonicalRequest) => void;

function selfHash(canonical: string): HttpRequestCommitment {
  const canonicalBytes = new TextEncoder().encode(canonical);
  const parsed = JSON.parse(canonical) as CanonicalRequest;
  return {
    bodySha256: parsed.bodySha256,
    canonicalBytes,
    commitment: `sha256:${createHash("sha256").update(canonicalBytes).digest("hex")}`,
    version: "sotto-http-request-v1",
  };
}

function forgeBinding(
  mutate: (canonical: CanonicalRequest) => void,
  serialize: (canonical: CanonicalRequest) => string = JSON.stringify,
): BoundedPurchaseCommitmentInput {
  const input = createPurchaseInput();
  const canonical = JSON.parse(
    new TextDecoder().decode(input.binding.canonicalBytes),
  ) as CanonicalRequest;
  mutate(canonical);
  const binding = selfHash(serialize(canonical));
  return mutateChallenge({ ...input, binding }, (challenge) => {
    challenge.accepts[0]!.extra.memo = binding.commitment;
    challenge.resource.url = canonical.url;
  });
}

const forgedCases: ReadonlyArray<readonly [string, CanonicalMutation, string]> =
  [
    ["lowercase method", (value) => void (value.method = "get"), "method"],
    [
      "non-HTTPS URL",
      (value) => void (value.url = "http://provider.example/paid/weather"),
      "HTTPS",
    ],
    [
      "duplicate header",
      (value) => void value.headers.push({ ...value.headers[0]! }),
      "headers",
    ],
    [
      "forbidden header",
      (value) =>
        void value.headers.push({
          name: "authorization",
          value: "Bearer hidden",
        }),
      "headers",
    ],
    [
      "header injection",
      (value) => void (value.headers[0]!.value = "safe\r\ninjected: yes"),
      "headers",
    ],
  ];

describe("bounded purchase request-binding validation", () => {
  it("refuses to canonicalize authoritative header injection", () => {
    expect(() =>
      commitHttpRequest({
        headers: [["content-type", "text/plain\r\nx-injected: yes"]],
        method: "POST",
        url: "https://provider.example/paid/weather",
      }),
    ).toThrow("header value");
  });

  it.each(forgedCases)("rejects a self-hashed %s", (_name, mutate, message) => {
    expect(() => commitBoundedPurchase(forgeBinding(mutate))).toThrow(message);
  });

  it("rejects noncanonical request-binding serialization", () => {
    expect(() =>
      commitBoundedPurchase(
        forgeBinding(
          () => undefined,
          (canonical) => `${JSON.stringify(canonical)} `,
        ),
      ),
    ).toThrow("canonical encoding");
  });
});
