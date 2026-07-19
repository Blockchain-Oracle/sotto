import { describe, expect, it } from "vitest";
import { readApiEnvironment } from "../src/env.js";

const BASE: Record<string, string> = {
  DATABASE_URL: "postgresql://sotto:secret@127.0.0.1:5432/sotto",
  SESSION_SECRET: "s".repeat(32),
  SIGNER_SERVICE_URL: "http://127.0.0.1:4402",
  SIGNER_SERVICE_TOKEN: "t".repeat(32),
  PUBLIC_APP_ORIGIN: "http://127.0.0.1:3000",
  PREPARE_AUTHORITY_KEY: `prepare-key:${Buffer.alloc(32, 7).toString("base64")}`,
  DELIVERY_KEY: `delivery-key:${Buffer.alloc(32, 13).toString("base64")}`,
  SOURCE_COMMIT: "cfe1a6386fb555b6e081cc1dc6480527ce5e9b56",
};

describe("api environment", () => {
  it("accepts a minimal configuration with honest absences", () => {
    const environment = readApiEnvironment(BASE);
    expect(environment.fiveNorth).toBeUndefined();
    expect(environment.openRouterApiKey).toBeUndefined();
    expect(environment.opsToken).toBeUndefined();
    expect(environment.composeModel).toBe("anthropic/claude-sonnet-4.5");
    expect(environment.port).toBe(4400);
  });

  it("names the missing variable in every failure", () => {
    for (const name of Object.keys(BASE)) {
      const source = { ...BASE };
      delete source[name];
      expect(() => readApiEnvironment(source)).toThrowError(
        new RegExp(name, "u"),
      );
    }
  });

  it("rejects a short session secret", () => {
    expect(() =>
      readApiEnvironment({ ...BASE, SESSION_SECRET: "short" }),
    ).toThrowError(/SESSION_SECRET/u);
  });

  it("rejects a partial Five North set naming the missing names", () => {
    expect(() =>
      readApiEnvironment({
        ...BASE,
        FIVE_NORTH_LEDGER_URL: "https://ledger.example.com",
      }),
    ).toThrowError(/incomplete Five North configuration/u);
  });

  it("accepts the complete Five North set", () => {
    const environment = readApiEnvironment({
      ...BASE,
      FIVE_NORTH_LEDGER_URL: "https://ledger.example.com",
      FIVE_NORTH_OIDC_AUDIENCE: "validator-devnet-m2m",
      FIVE_NORTH_OIDC_CLIENT_ID: "validator-devnet-m2m",
      FIVE_NORTH_OIDC_CLIENT_SECRET: "secret",
      FIVE_NORTH_OIDC_ISSUER_URL: "https://issuer.example.com",
      FIVE_NORTH_OIDC_SCOPE: "daml_ledger_api",
      FIVE_NORTH_OIDC_TOKEN_URL: "https://issuer.example.com/token/",
      FIVE_NORTH_VALIDATOR_URL: "https://validator.example.com",
      FIVE_NORTH_SYNCHRONIZER_ID: `global-domain::1220${"b".repeat(64)}`,
      FIVE_NORTH_DSO_ADMIN_PARTY: `DSO::1220${"c".repeat(64)}`,
      FIVE_NORTH_TRANSFER_FACTORY_CONTRACT_ID: "00" + "9f".repeat(60),
    });
    expect(environment.fiveNorth).toMatchObject({
      synchronizerId: `global-domain::1220${"b".repeat(64)}`,
      dsoAdminParty: `DSO::1220${"c".repeat(64)}`,
    });
  });

  it("requires HTTPS for a non-loopback signer URL", () => {
    expect(() =>
      readApiEnvironment({
        ...BASE,
        SIGNER_SERVICE_URL: "http://signer.example.com",
      }),
    ).toThrowError(/SIGNER_SERVICE_URL/u);
  });
});
