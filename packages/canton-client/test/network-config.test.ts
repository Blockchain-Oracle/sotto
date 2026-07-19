import { describe, expect, it } from "vitest";
import { readFiveNorthNetworkConfig } from "../src/index.js";

function validEnvironment(): Record<string, string> {
  return {
    FIVE_NORTH_LEDGER_URL: "https://ledger.example.invalid",
    FIVE_NORTH_OIDC_AUDIENCE: "validator-devnet-m2m",
    FIVE_NORTH_OIDC_CLIENT_ID: "validator-devnet-m2m",
    FIVE_NORTH_OIDC_CLIENT_SECRET: "example-secret",
    FIVE_NORTH_OIDC_ISSUER_URL: "https://auth.example.invalid/issuer",
    FIVE_NORTH_OIDC_SCOPE: "daml_ledger_api",
    FIVE_NORTH_OIDC_TOKEN_URL: "https://auth.example.invalid/token/",
    FIVE_NORTH_VALIDATOR_URL: "https://wallet.example.invalid/api/validator",
  };
}

describe("Five North network configuration", () => {
  it("parses a complete FIVE_NORTH_* environment", () => {
    expect(readFiveNorthNetworkConfig(validEnvironment())).toEqual({
      audience: "validator-devnet-m2m",
      clientId: "validator-devnet-m2m",
      clientSecret: "example-secret",
      issuerUrl: "https://auth.example.invalid/issuer",
      ledgerUrl: "https://ledger.example.invalid",
      scope: "daml_ledger_api",
      tokenUrl: "https://auth.example.invalid/token/",
      validatorUrl: "https://wallet.example.invalid/api/validator",
    });
  });

  it("preserves the token URL trailing slash and strips it elsewhere", () => {
    const environment = {
      ...validEnvironment(),
      FIVE_NORTH_LEDGER_URL: "https://ledger.example.invalid/",
    };
    const config = readFiveNorthNetworkConfig(environment);
    expect(config.ledgerUrl).toBe("https://ledger.example.invalid");
    expect(config.tokenUrl).toBe("https://auth.example.invalid/token/");
  });

  it.each(Object.keys(validEnvironment()))(
    "names %s when it is missing",
    (name) => {
      const environment = validEnvironment();
      delete environment[name];
      expect(() => readFiveNorthNetworkConfig(environment)).toThrowError(
        `Missing required configuration: ${name}`,
      );
    },
  );

  it.each(Object.keys(validEnvironment()))(
    "names %s when it is blank",
    (name) => {
      const environment = { ...validEnvironment(), [name]: "   " };
      expect(() => readFiveNorthNetworkConfig(environment)).toThrowError(
        `Missing required configuration: ${name}`,
      );
    },
  );

  it.each([
    "FIVE_NORTH_LEDGER_URL",
    "FIVE_NORTH_OIDC_ISSUER_URL",
    "FIVE_NORTH_OIDC_TOKEN_URL",
    "FIVE_NORTH_VALIDATOR_URL",
  ])("rejects a plain-HTTP %s by field name", (name) => {
    const environment = {
      ...validEnvironment(),
      [name]: "http://insecure.example.invalid",
    };
    expect(() => readFiveNorthNetworkConfig(environment)).toThrowError(
      `${name} must use HTTPS`,
    );
  });

  it.each([
    "FIVE_NORTH_LEDGER_URL",
    "FIVE_NORTH_OIDC_ISSUER_URL",
    "FIVE_NORTH_OIDC_TOKEN_URL",
    "FIVE_NORTH_VALIDATOR_URL",
  ])("rejects an unparseable %s by field name", (name) => {
    const environment = { ...validEnvironment(), [name]: "not a url" };
    expect(() => readFiveNorthNetworkConfig(environment)).toThrowError(
      `${name} must be a valid URL`,
    );
  });
});
