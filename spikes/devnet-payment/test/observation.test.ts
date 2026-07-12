import { describe, expect, it } from "vitest";
import {
  decodePaymentRequired,
  selectCantonRequirement,
} from "../src/observation.js";

const cantonRequirement = {
  amount: "1.25",
  asset: "CC",
  extra: {
    expiresAt: "2026-07-12T16:00:00.000Z",
    requestHash: "sha256:request",
  },
  maxTimeoutSeconds: 60,
  network: "canton:devnet",
  payTo: "provider::1220abc",
  scheme: "exact",
};

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
});

describe("selectCantonRequirement", () => {
  it("selects only exact canton:devnet and preserves signer-bound fields", () => {
    const selected = selectCantonRequirement(
      {
        accepts: [
          { ...cantonRequirement, network: "eip155:8453" },
          cantonRequirement,
        ],
        x402Version: 2,
      },
      new Date("2026-07-12T15:59:00.000Z"),
    );

    expect(selected).toEqual({
      amount: "1.25",
      asset: "CC",
      expiresAt: "2026-07-12T16:00:00.000Z",
      network: "canton:devnet",
      recipient: "provider::1220abc",
      requestHash: "sha256:request",
    });
  });

  it("rejects an expired requirement", () => {
    expect(() =>
      selectCantonRequirement(
        { accepts: [cantonRequirement], x402Version: 2 },
        new Date("2026-07-12T16:00:00.000Z"),
      ),
    ).toThrow("expired");
  });

  it("rejects a requirement without request binding", () => {
    const unbound = {
      ...cantonRequirement,
      extra: { expiresAt: cantonRequirement.extra.expiresAt },
    };

    expect(() =>
      selectCantonRequirement(
        { accepts: [unbound], x402Version: 2 },
        new Date("2026-07-12T15:59:00.000Z"),
      ),
    ).toThrow("requestHash");
  });
});
