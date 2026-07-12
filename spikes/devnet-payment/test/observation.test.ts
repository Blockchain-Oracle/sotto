import { describe, expect, it } from "vitest";
import {
  createChallengeObservation,
  decodePaymentRequired,
  selectCantonRequirement,
} from "../src/observation.js";

const cantonRequirement = {
  amount: "12500000000",
  asset: "CC",
  extra: {
    assetTransferMethod: "transfer-factory",
    executeBeforeSeconds: 60,
    feePayer: "facilitator::1220fee",
    instrumentId: { admin: "DSO::1220dso", id: "Amulet" },
    synchronizerId: "global-domain::1220sync",
  },
  maxTimeoutSeconds: 60,
  network: "canton:devnet",
  payTo: "provider::1220abc",
  scheme: "exact",
} as const;

describe("decodePaymentRequired", () => {
  it("decodes an x402 v2 PAYMENT-REQUIRED header", () => {
    const challenge = {
      accepts: [cantonRequirement],
      resource: { url: "https://provider.example/resource" },
      x402Version: 2,
    };
    const header = Buffer.from(JSON.stringify(challenge)).toString("base64");

    expect(decodePaymentRequired(header)).toEqual(challenge);
  });

  it("rejects a non-v2 challenge", () => {
    const header = Buffer.from(
      JSON.stringify({ accepts: [cantonRequirement], x402Version: 1 }),
    ).toString("base64");

    expect(() => decodePaymentRequired(header)).toThrow("x402Version 2");
  });

  it("rejects an oversized PAYMENT-REQUIRED header before decoding", () => {
    expect(() => decodePaymentRequired("A".repeat(16_385))).toThrow(
      "exceeds 16384 bytes",
    );
  });
});

describe("selectCantonRequirement", () => {
  it("selects only exact canton:devnet and preserves signer-bound fields", () => {
    const selected = selectCantonRequirement({
      accepts: [
        { ...cantonRequirement, network: "eip155:8453" },
        cantonRequirement,
      ],
      x402Version: 2,
    });

    expect(selected).toEqual(cantonRequirement);
    expect(selected).not.toHaveProperty("expiresAt");
    expect(selected).not.toHaveProperty("requestHash");
  });

  it("rejects ambiguous exact Canton DevNet requirements", () => {
    expect(() =>
      selectCantonRequirement({
        accepts: [cantonRequirement, cantonRequirement],
        x402Version: 2,
      }),
    ).toThrow("exactly one");
  });

  it("rejects a challenge without Canton DevNet", () => {
    expect(() =>
      selectCantonRequirement({
        accepts: [{ ...cantonRequirement, network: "canton:mainnet" }],
        x402Version: 2,
      }),
    ).toThrow("canton:devnet");
  });
});

describe("createChallengeObservation", () => {
  it("creates deterministic redacted evidence with split outcomes", () => {
    const input = {
      challenge: cantonRequirement,
      headers: [["content-type", "application/json"]] as const,
      method: "POST",
      observedAt: "2026-07-12T15:59:00.000Z",
      requestBody: new TextEncoder().encode('{"prompt":"private task"}'),
      resourceUrl: "https://provider.example/private?token=secret-value",
      upstreamResourceUrl:
        "https://provider.example/private?token=secret-value",
    };

    const first = createChallengeObservation(input);
    const second = createChallengeObservation(input);
    const serialized = JSON.stringify(first);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      bindingVersion: "sotto-http-request-v1",
      compatibility: {
        exactRequestBinding: "not-proven",
        paymentFields: "valid",
        resourceUrlBinding: "matched",
        wire: "compatible",
      },
      delivery: "pending",
      httpStatus: 402,
      requestCommitment: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      settlement: "pending",
    });
    expect(first.attemptId).toBe(first.requestCommitment);
    expect(serialized).not.toContain("private task");
    expect(serialized).not.toContain("secret-value");
    expect(serialized).not.toContain("provider.example");
  });
});
