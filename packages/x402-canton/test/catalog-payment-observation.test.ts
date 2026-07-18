import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectCatalogPaymentRequiredResponse } from "../src/index.js";

const RESOURCE_URL = "https://provider.example/v1/weather";
const NETWORK = "canton:devnet" as const;

function challenge(
  mutate?: (value: Record<string, unknown>) => void,
): Record<string, unknown> {
  const value: Record<string, unknown> = {
    x402Version: 2,
    resource: { url: RESOURCE_URL },
    accepts: [
      {
        scheme: "exact",
        network: NETWORK,
        amount: "2500000000",
        asset: "CC",
        payTo: "sotto-provider::1220provider",
        maxTimeoutSeconds: 60,
        extra: {
          assetTransferMethod: "transfer-factory",
          executeBeforeSeconds: 45,
          feePayer: "sotto-payer::1220payer",
          instrumentId: { admin: "DSO::1220dso", id: "Amulet" },
          memo: "sha256:private-request-commitment",
          synchronizerId: "global-domain::1220sync",
        },
      },
    ],
  };
  mutate?.(value);
  return value;
}

function responseFromBytes(bytes: Uint8Array): Response {
  return new Response(null, {
    headers: { "PAYMENT-REQUIRED": Buffer.from(bytes).toString("base64") },
    status: 402,
  });
}

function response(value = challenge()): Response {
  return responseFromBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function inspect(input = response()) {
  return inspectCatalogPaymentRequiredResponse(input, {
    expectedNetwork: NETWORK,
    expectedResourceUrl: RESOURCE_URL,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-07-18T10:00:00.000Z") });
});

afterEach(() => vi.useRealTimers());

describe("catalog PAYMENT-REQUIRED observation", () => {
  it("projects one authentic transfer-factory requirement without secrets", () => {
    const projection = inspect();

    expect(projection).toEqual({
      amountAtomic: "2500000000",
      asset: "CC",
      challengeHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      network: NETWORK,
      observedAt: "2026-07-18T10:00:00.000Z",
      recipient: "sotto-provider::1220provider",
      resourceUrl: RESOURCE_URL,
      scheme: "exact",
      transferMethod: "transfer-factory",
      x402Version: 2,
    });
    expect(Object.isFrozen(projection)).toBe(true);
    expect(JSON.stringify(projection)).not.toMatch(
      /private-request|feePayer|synchronizer|instrumentId|PAYMENT-REQUIRED/u,
    );
  });

  it.each([
    [
      "wrong resource",
      (value: Record<string, unknown>) => {
        value.resource = { url: "https://attacker.example/v1/weather" };
      },
    ],
    [
      "zero amount",
      (value: Record<string, unknown>) => {
        (value.accepts as Array<Record<string, unknown>>)[0]!.amount = "0";
      },
    ],
    [
      "wrong transfer",
      (value: Record<string, unknown>) => {
        const requirement = (
          value.accepts as Array<Record<string, unknown>>
        )[0]!;
        (requirement.extra as Record<string, unknown>).assetTransferMethod =
          "amulet-rules-transfer";
      },
    ],
    [
      "second matching requirement",
      (value: Record<string, unknown>) => {
        const accepts = value.accepts as Array<Record<string, unknown>>;
        accepts.push(structuredClone(accepts[0]!));
      },
    ],
    [
      "unexpected requirement member",
      (value: Record<string, unknown>) => {
        (value.accepts as Array<Record<string, unknown>>)[0]!.redirect =
          "https://attacker.example";
      },
    ],
    [
      "oversized asset",
      (value: Record<string, unknown>) => {
        (value.accepts as Array<Record<string, unknown>>)[0]!.asset =
          "A".repeat(65);
      },
    ],
    [
      "oversized recipient",
      (value: Record<string, unknown>) => {
        (value.accepts as Array<Record<string, unknown>>)[0]!.payTo =
          "p".repeat(256);
      },
    ],
    [
      "unsafe persisted identifier",
      (value: Record<string, unknown>) => {
        (value.accepts as Array<Record<string, unknown>>)[0]!.asset = "C C";
      },
    ],
    [
      "format-character recipient",
      (value: Record<string, unknown>) => {
        (value.accepts as Array<Record<string, unknown>>)[0]!.payTo =
          "party\u200b::suffix";
      },
    ],
  ])("rejects %s", (_name, mutate) => {
    expect(() => inspect(response(challenge(mutate)))).toThrow();
  });

  it("rejects duplicate JSON keys before parsing", () => {
    const source = JSON.stringify(challenge()).replace(
      '"x402Version":2',
      '"x402Version":2,"x402Version":2',
    );
    expect(() =>
      inspect(responseFromBytes(new TextEncoder().encode(source))),
    ).toThrow(/duplicate JSON key/iu);
  });

  it("rejects missing and noncanonical PAYMENT-REQUIRED carriers", () => {
    expect(() =>
      inspectCatalogPaymentRequiredResponse(
        new Response(null, { status: 402 }),
        {
          expectedNetwork: NETWORK,
          expectedResourceUrl: RESOURCE_URL,
        },
      ),
    ).toThrow(/PAYMENT-REQUIRED/u);
    const malformed = new Response(null, {
      headers: { "PAYMENT-REQUIRED": "e30" },
      status: 402,
    });
    expect(() => inspect(malformed)).toThrow(/canonical base64/iu);
  });
});
