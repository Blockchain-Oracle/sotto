import { describe, expect, it } from "vitest";
import { readWorkerEnvironment } from "../src/env.js";

const KEY_32 = Buffer.alloc(32, 7).toString("base64");
const FINGERPRINT = `1220${"a".repeat(64)}`;

function validEnvironment(): Record<string, string> {
  return {
    DATABASE_URL: "postgresql://sotto:secret@127.0.0.1:5432/sotto",
    WORKER_LEASE_OWNER: "worker-a",
    PREPARE_AUTHORITY_KEY: `prepare-key-2026-07:${KEY_32}`,
    DELIVERY_KEY: `delivery-key-2026-07:${KEY_32}`,
    SIGNER_SERVICE_URL: "https://signer.internal.example.com",
    SIGNER_SERVICE_TOKEN: "signer-token",
    SOURCE_COMMIT: "cfe1a6386fb555b6e081cc1dc6480527ce5e9b56",
    FIVE_NORTH_OIDC_AUDIENCE: "validator-devnet-m2m",
    FIVE_NORTH_OIDC_CLIENT_ID: "validator-devnet-m2m",
    FIVE_NORTH_OIDC_CLIENT_SECRET: "client-secret",
    FIVE_NORTH_OIDC_ISSUER_URL: "https://auth.example.com/issuer",
    FIVE_NORTH_OIDC_SCOPE: "daml_ledger_api",
    FIVE_NORTH_OIDC_TOKEN_URL: "https://auth.example.com/token/",
    FIVE_NORTH_LEDGER_URL: "https://ledger.example.com",
    FIVE_NORTH_VALIDATOR_URL: "https://validator.example.com/api/validator",
  };
}

describe("worker environment parser", () => {
  it("parses a complete configuration", () => {
    const environment = readWorkerEnvironment(validEnvironment());
    expect(environment.databaseUrl).toContain("postgresql://");
    expect(environment.leaseOwner).toBe("worker-a");
    expect(environment.prepareAuthorityKey.activeKeyId).toBe(
      "prepare-key-2026-07",
    );
    expect(environment.privateDeliveryKey.keys).toHaveLength(1);
    expect(environment.signerServiceUrl).toBe(
      "https://signer.internal.example.com",
    );
    expect(environment.network.ledgerUrl).toBe("https://ledger.example.com");
    expect(environment.humanWalletPublicKeys.size).toBe(0);
  });

  it.each([
    "DATABASE_URL",
    "WORKER_LEASE_OWNER",
    "PREPARE_AUTHORITY_KEY",
    "DELIVERY_KEY",
    "SIGNER_SERVICE_URL",
    "SIGNER_SERVICE_TOKEN",
    "SOURCE_COMMIT",
    "FIVE_NORTH_OIDC_CLIENT_SECRET",
  ])("fails closed naming the missing variable %s", (name) => {
    const environment = validEnvironment();
    delete environment[name];
    expect(() => readWorkerEnvironment(environment)).toThrowError(name);
  });

  it("rejects non-postgres database URLs", () => {
    const environment = validEnvironment();
    environment.DATABASE_URL = "https://database.example.com/sotto";
    expect(() => readWorkerEnvironment(environment)).toThrowError(
      "DATABASE_URL must use the postgres scheme",
    );
  });

  it.each([
    ["missing separator", KEY_32],
    ["bad identifier", `:${KEY_32}`],
    ["short key", `prepare:${Buffer.alloc(16, 1).toString("base64")}`],
    ["non-base64 key", "prepare:not-base64!"],
  ])("rejects prepare key material with %s", (_label, value) => {
    const environment = validEnvironment();
    environment.PREPARE_AUTHORITY_KEY = value;
    expect(() => readWorkerEnvironment(environment)).toThrowError(
      "PREPARE_AUTHORITY_KEY",
    );
  });

  it("rejects non-loopback HTTP signer URLs and keeps loopback HTTP", () => {
    const environment = validEnvironment();
    environment.SIGNER_SERVICE_URL = "http://signer.example.com";
    expect(() => readWorkerEnvironment(environment)).toThrowError(
      "SIGNER_SERVICE_URL must use HTTPS",
    );
    environment.SIGNER_SERVICE_URL = "http://127.0.0.1:8321";
    expect(readWorkerEnvironment(environment).signerServiceUrl).toBe(
      "http://127.0.0.1:8321",
    );
  });

  it("rejects malformed source commits", () => {
    const environment = validEnvironment();
    environment.SOURCE_COMMIT = "main";
    expect(() => readWorkerEnvironment(environment)).toThrowError(
      "SOURCE_COMMIT must be a 40-character lowercase commit hash",
    );
  });

  it("parses optional human wallet public keys fail-closed", () => {
    const environment = validEnvironment();
    environment.HUMAN_WALLET_PUBLIC_KEYS = JSON.stringify({
      [FINGERPRINT]: KEY_32,
    });
    const parsed = readWorkerEnvironment(environment);
    expect(parsed.humanWalletPublicKeys.get(FINGERPRINT)?.byteLength).toBe(32);
    environment.HUMAN_WALLET_PUBLIC_KEYS = JSON.stringify({
      "not-a-fingerprint": KEY_32,
    });
    expect(() => readWorkerEnvironment(environment)).toThrowError(
      "HUMAN_WALLET_PUBLIC_KEYS fingerprint keys must be 1220-prefixed hex",
    );
  });
});
