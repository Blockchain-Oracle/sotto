import { describe, expect, it } from "vitest";
import { SOTTO_CONTROL_PACKAGE_ID } from "@sotto/x402-canton";
import {
  readFiveNorthNetworkConfig,
  readSpikeConfig,
  summarizeConfig,
} from "../src/config.js";

const completeEnvironment = {
  CANTON_EXPLORER_BASE_URL: "https://scan.example",
  FIVE_NORTH_LEDGER_URL: "https://ledger.example",
  FIVE_NORTH_OIDC_AUDIENCE: "ledger-audience",
  FIVE_NORTH_OIDC_CLIENT_ID: "client",
  FIVE_NORTH_OIDC_CLIENT_SECRET: "secret-value",
  FIVE_NORTH_OIDC_ISSUER_URL: "https://issuer.example",
  FIVE_NORTH_OIDC_SCOPE: "ledger-scope",
  FIVE_NORTH_OIDC_TOKEN_URL: "https://issuer.example/token",
  FIVE_NORTH_VALIDATOR_URL: "https://validator.example/api/validator",
  PAID_PROVIDER_URL: "https://provider.example/resource",
  PAYER_PARTY: "payer::1220abc",
  PAYER_SIGNER_URL: "https://signer.example",
  POLICY_AGENT_PARTY: "policy-agent::1220aaa",
  POLICY_OUTSIDER_PARTY: "policy-outsider::1220bbb",
  POLICY_OWNER_PARTY: "policy-owner::1220ccc",
  PROVIDER_PARTY: "provider::1220def",
  SOTTO_CONTROL_PACKAGE_ID,
  SOTTO_PURCHASE_ID: "phase3-baseline-1",
  X402_RELAY_URL: "https://relay.example",
};

describe("readSpikeConfig", () => {
  it("reads Five North deployment access without unrelated spike settings", () => {
    expect(
      readFiveNorthNetworkConfig({
        FIVE_NORTH_LEDGER_URL: completeEnvironment.FIVE_NORTH_LEDGER_URL,
        FIVE_NORTH_OIDC_AUDIENCE: completeEnvironment.FIVE_NORTH_OIDC_AUDIENCE,
        FIVE_NORTH_OIDC_CLIENT_ID:
          completeEnvironment.FIVE_NORTH_OIDC_CLIENT_ID,
        FIVE_NORTH_OIDC_CLIENT_SECRET:
          completeEnvironment.FIVE_NORTH_OIDC_CLIENT_SECRET,
        FIVE_NORTH_OIDC_ISSUER_URL:
          completeEnvironment.FIVE_NORTH_OIDC_ISSUER_URL,
        FIVE_NORTH_OIDC_SCOPE: completeEnvironment.FIVE_NORTH_OIDC_SCOPE,
        FIVE_NORTH_OIDC_TOKEN_URL:
          completeEnvironment.FIVE_NORTH_OIDC_TOKEN_URL,
        FIVE_NORTH_VALIDATOR_URL: completeEnvironment.FIVE_NORTH_VALIDATOR_URL,
      }),
    ).toEqual({
      audience: "ledger-audience",
      clientId: "client",
      clientSecret: "secret-value",
      issuerUrl: "https://issuer.example",
      ledgerUrl: "https://ledger.example",
      scope: "ledger-scope",
      tokenUrl: "https://issuer.example/token",
      validatorUrl: "https://validator.example/api/validator",
    });
  });

  it("separates network, relay, payer, provider, and explorer settings", () => {
    expect(readSpikeConfig(completeEnvironment)).toMatchObject({
      explorer: { baseUrl: "https://scan.example" },
      network: {
        audience: "ledger-audience",
        issuerUrl: "https://issuer.example",
        ledgerUrl: "https://ledger.example",
        scope: "ledger-scope",
        tokenUrl: "https://issuer.example/token",
        validatorUrl: "https://validator.example/api/validator",
      },
      provider: {
        party: "provider::1220def",
        resourceUrl: "https://provider.example/resource",
      },
      payer: { purchaseId: "phase3-baseline-1" },
      policy: {
        agentParty: "policy-agent::1220aaa",
        outsiderParty: "policy-outsider::1220bbb",
        ownerParty: "policy-owner::1220ccc",
        packageId: SOTTO_CONTROL_PACKAGE_ID,
      },
      relay: { url: "https://relay.example" },
    });
  });

  it("fails closed when signer configuration is absent", () => {
    const missingSigner: Record<string, string> = { ...completeEnvironment };
    Reflect.deleteProperty(missingSigner, "PAYER_SIGNER_URL");
    expect(() => readSpikeConfig(missingSigner)).toThrow("PAYER_SIGNER_URL");
  });

  it("preserves an OIDC token endpoint trailing slash", () => {
    expect(
      readSpikeConfig({
        ...completeEnvironment,
        FIVE_NORTH_OIDC_TOKEN_URL:
          "https://issuer.example/application/o/token/",
      }).network.tokenUrl,
    ).toBe("https://issuer.example/application/o/token/");
  });

  it.each(["f72d7eb3", "G".repeat(64)])(
    "rejects invalid Sotto package ID %s",
    (packageId) => {
      expect(() =>
        readSpikeConfig({
          ...completeEnvironment,
          SOTTO_CONTROL_PACKAGE_ID: packageId,
        }),
      ).toThrow("SOTTO_CONTROL_PACKAGE_ID");
    },
  );

  it("rejects a valid but unapproved Sotto package ID", () => {
    expect(() =>
      readSpikeConfig({
        ...completeEnvironment,
        SOTTO_CONTROL_PACKAGE_ID: "f".repeat(64),
      }),
    ).toThrow(/approved Sotto control package/i);
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
