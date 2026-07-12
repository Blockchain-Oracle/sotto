import { describe, expect, it } from "vitest";
import { readSpikeConfig, summarizeConfig } from "../src/config.js";

const completeEnvironment = {
  CANTON_EXPLORER_BASE_URL: "https://scan.example",
  FIVE_NORTH_LEDGER_URL: "https://ledger.example",
  FIVE_NORTH_OIDC_CLIENT_ID: "client",
  FIVE_NORTH_OIDC_CLIENT_SECRET: "secret-value",
  FIVE_NORTH_OIDC_ISSUER_URL: "https://issuer.example",
  PAID_PROVIDER_URL: "https://provider.example/resource",
  PAYER_PARTY: "payer::1220abc",
  PAYER_SIGNER_URL: "https://signer.example",
  X402_RELAY_URL: "https://relay.example",
};

describe("readSpikeConfig", () => {
  it("separates network, relay, payer, provider, and explorer settings", () => {
    expect(readSpikeConfig(completeEnvironment)).toMatchObject({
      explorer: { baseUrl: "https://scan.example" },
      network: { ledgerUrl: "https://ledger.example" },
      provider: { resourceUrl: "https://provider.example/resource" },
      relay: { url: "https://relay.example" },
    });
  });

  it("fails closed when signer configuration is absent", () => {
    const missingSigner: Record<string, string> = { ...completeEnvironment };
    Reflect.deleteProperty(missingSigner, "PAYER_SIGNER_URL");
    expect(() => readSpikeConfig(missingSigner)).toThrow("PAYER_SIGNER_URL");
  });

  it("produces a preflight summary without secret or party values", () => {
    const summary = JSON.stringify(
      summarizeConfig(readSpikeConfig(completeEnvironment)),
    );
    expect(summary).not.toContain("secret-value");
    expect(summary).not.toContain("payer::1220abc");
    expect(summary).toContain('"configured":true');
  });
});
