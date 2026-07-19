import { chmodSync, lstatSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSignerEnvironment } from "../src/env.js";
import { environmentSource, temporaryKeyDirectory } from "./fixtures.js";

const cleanups: string[] = [];
afterEach(() => {
  for (const path of cleanups.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});

function keyDirectory(): string {
  const path = temporaryKeyDirectory();
  cleanups.push(path);
  return path;
}

function fiveNorthSource(): Record<string, string> {
  return {
    FIVE_NORTH_LEDGER_URL: "https://ledger.example.invalid",
    FIVE_NORTH_OIDC_AUDIENCE: "validator-devnet-m2m",
    FIVE_NORTH_OIDC_CLIENT_ID: "validator-devnet-m2m",
    FIVE_NORTH_OIDC_CLIENT_SECRET: "example-secret",
    FIVE_NORTH_OIDC_ISSUER_URL: "https://auth.example.invalid/issuer",
    FIVE_NORTH_OIDC_SCOPE: "daml_ledger_api",
    FIVE_NORTH_OIDC_TOKEN_URL: "https://auth.example.invalid/token/",
    FIVE_NORTH_SYNCHRONIZER_ID: "sync::devnet",
    FIVE_NORTH_VALIDATOR_URL: "https://wallet.example.invalid/api/validator",
  };
}

describe("signer environment", () => {
  it("parses a complete environment without Five North", () => {
    const directory = keyDirectory();
    const env = readSignerEnvironment(environmentSource(directory));
    expect(env.keyDirectory).toBe(directory);
    expect(env.fiveNorth).toBeUndefined();
    expect(env.port).toBe(4402);
    expect(env.publicWalletOrigin).toBe("http://127.0.0.1:4402");
  });

  it("creates a missing key directory with mode 0700", () => {
    const directory = keyDirectory();
    const nested = join(directory, "state");
    const env = readSignerEnvironment({
      ...environmentSource(directory),
      SIGNER_KEY_DIR: nested,
    });
    expect(env.keyDirectory).toBe(nested);
    expect(lstatSync(nested).mode & 0o777).toBe(0o700);
  });

  it("rejects a key directory that is not owner-only", () => {
    const directory = keyDirectory();
    chmodSync(directory, 0o755);
    expect(() => readSignerEnvironment(environmentSource(directory))).toThrow(
      /mode 0700/,
    );
  });

  it("rejects a relative key directory", () => {
    expect(() =>
      readSignerEnvironment({
        ...environmentSource("relative/path"),
        SIGNER_KEY_DIR: "relative/path",
      }),
    ).toThrow(/absolute/);
  });

  it.each([
    ["SIGNER_SERVICE_TOKEN", "short"],
    ["WALLET_SESSION_SECRET", "short"],
  ])("rejects a short %s", (name, value) => {
    const directory = keyDirectory();
    expect(() =>
      readSignerEnvironment({ ...environmentSource(directory), [name]: value }),
    ).toThrow(/at least 32 characters/);
  });

  it.each([
    ["missing", undefined],
    ["with a path", "http://127.0.0.1:4402/wallet"],
    ["non-http", "ftp://wallet.example.invalid"],
  ])("rejects PUBLIC_WALLET_ORIGIN %s", (_label, value) => {
    const directory = keyDirectory();
    const source = { ...environmentSource(directory) };
    if (value === undefined) delete source.PUBLIC_WALLET_ORIGIN;
    else source.PUBLIC_WALLET_ORIGIN = value;
    expect(() => readSignerEnvironment(source)).toThrow(/PUBLIC_WALLET_ORIGIN/);
  });

  it("reads a complete Five North gate", () => {
    const directory = keyDirectory();
    const env = readSignerEnvironment({
      ...environmentSource(directory),
      ...fiveNorthSource(),
    });
    expect(env.fiveNorth?.synchronizerId).toBe("sync::devnet");
    expect(env.fiveNorth?.config.ledgerUrl).toBe(
      "https://ledger.example.invalid",
    );
  });

  it("rejects a partial Five North configuration", () => {
    const directory = keyDirectory();
    const source = { ...environmentSource(directory), ...fiveNorthSource() };
    delete source.FIVE_NORTH_OIDC_CLIENT_SECRET;
    expect(() => readSignerEnvironment(source)).toThrow(
      /incomplete Five North configuration/,
    );
  });

  it("requires the synchronizer with the Five North set", () => {
    const directory = keyDirectory();
    const source = { ...environmentSource(directory), ...fiveNorthSource() };
    delete source.FIVE_NORTH_SYNCHRONIZER_ID;
    expect(() => readSignerEnvironment(source)).toThrow(
      /FIVE_NORTH_SYNCHRONIZER_ID/,
    );
  });

  it("rejects an invalid SIGNER_PORT", () => {
    const directory = keyDirectory();
    expect(() =>
      readSignerEnvironment({
        ...environmentSource(directory),
        SIGNER_PORT: "70000",
      }),
    ).toThrow(/SIGNER_PORT/);
  });
});
