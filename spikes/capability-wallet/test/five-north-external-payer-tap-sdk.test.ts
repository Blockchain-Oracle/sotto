import { describe, expect, it, vi } from "vitest";
import {
  acquireFiveNorthExternalPayerTapPreparation,
  type TapSdkDependencies,
} from "../src/five-north-external-payer-tap-sdk.js";
import {
  TAP_AMOUNT,
  TAP_PAYER,
  TAP_SYNCHRONIZER,
} from "./five-north-external-payer-tap.fixtures.js";

const environment = {
  FIVE_NORTH_LEDGER_URL:
    "https://ledger-api.validator.devnet.sandbox.fivenorth.io",
  FIVE_NORTH_OIDC_AUDIENCE: "validator-devnet-m2m",
  FIVE_NORTH_OIDC_CLIENT_ID: "validator-devnet-m2m",
  FIVE_NORTH_OIDC_CLIENT_SECRET: "test-only-secret",
  FIVE_NORTH_OIDC_ISSUER_URL:
    "https://auth.sandbox.fivenorth.io/application/o/validator-devnet-m2m/",
  FIVE_NORTH_OIDC_SCOPE: "daml_ledger_api",
  FIVE_NORTH_VALIDATOR_URL:
    "https://wallet.validator.devnet.sandbox.fivenorth.io/api/validator",
};

describe("Five North external payer tap SDK connector", () => {
  it("uses only the approved endpoints and exact interactive submission", async () => {
    const command = { ExerciseCommand: { choice: "tap" } };
    const disclosures = [{ contractId: "00rules" }];
    const response = {
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2" as const,
      preparedTransaction: "AA==",
      preparedTransactionHash: Buffer.alloc(32, 7).toString("base64"),
    };
    const rawResponse = { ...response };
    const signed = { signed: true };
    const tap = vi.fn(async () => [command, disclosures] as const);
    const prepare = vi.fn(() => ({
      preparedPromise: Promise.resolve(rawResponse),
      toJSON: async () => ({ response }),
    }));
    const fromSignature = vi.fn(() => signed);
    const execute = vi.fn(async () => ({
      completionOffset: 44,
      updateId: "1220tap-update",
    }));
    const createSdk = vi.fn(
      async (config: Parameters<TapSdkDependencies["createSdk"]>[0]) => {
        void config;
        return {
          amulet: { tap },
          ledger: { execute, fromSignature, prepare },
        };
      },
    );
    const signal = new AbortController().signal;

    const prepareTap = await acquireFiveNorthExternalPayerTapPreparation(
      environment,
      signal,
      { createSdk },
    );
    const dispatch = await prepareTap({
      amount: TAP_AMOUNT,
      payerParty: TAP_PAYER,
      signal,
      submissionId: `sotto-external-payer-tap-v1-${"a".repeat(64)}`,
      synchronizerId: TAP_SYNCHRONIZER,
    });
    await expect(dispatch.execute("wallet-signature")).resolves.toEqual({
      completionOffset: 44,
      updateId: "1220tap-update",
    });

    const config = createSdk.mock.calls[0]?.[0];
    if (config === undefined) throw new Error("SDK config was not captured");
    expect(config).toMatchObject({
      amulet: {
        registryUrl: new URL(
          "https://wallet.validator.devnet.sandbox.fivenorth.io/api/validator/v0/scan-proxy",
        ),
        scanApiUrl: new URL(
          "https://wallet.validator.devnet.sandbox.fivenorth.io/api/validator",
        ),
        validatorUrl: new URL(
          "https://wallet.validator.devnet.sandbox.fivenorth.io/api/validator",
        ),
      },
      auth: {
        configUrl:
          "https://auth.sandbox.fivenorth.io/application/o/validator-devnet-m2m/.well-known/openid-configuration",
        credentials: {
          audience: "validator-devnet-m2m",
          clientId: "validator-devnet-m2m",
          clientSecret: "test-only-secret",
          scope: "daml_ledger_api",
        },
        method: "client_credentials",
      },
      ledgerClientUrl:
        "https://ledger-api.validator.devnet.sandbox.fivenorth.io/",
    });
    expect(config.amulet.auth).toBe(config.auth);
    expect(tap).toHaveBeenCalledWith(TAP_PAYER, TAP_AMOUNT);
    expect(prepare).toHaveBeenCalledWith({
      commandId: `sotto-external-payer-tap-v1-${"a".repeat(64)}`,
      commands: command,
      disclosedContracts: disclosures,
      partyId: TAP_PAYER,
      synchronizerId: TAP_SYNCHRONIZER,
    });
    expect(fromSignature).toHaveBeenCalledWith(rawResponse, "wallet-signature");
    expect(execute).toHaveBeenCalledWith(signed, {
      partyId: TAP_PAYER,
      submissionId: `sotto-external-payer-tap-v1-${"a".repeat(64)}`,
    });
  });

  it("rejects endpoint substitution before initializing the SDK", async () => {
    const createSdk = vi.fn();
    await expect(
      acquireFiveNorthExternalPayerTapPreparation(
        {
          ...environment,
          FIVE_NORTH_VALIDATOR_URL: "https://attacker.example/validator",
        },
        new AbortController().signal,
        { createSdk },
      ),
    ).rejects.toThrow(/approved Five North/iu);
    expect(createSdk).not.toHaveBeenCalled();
  });
});
