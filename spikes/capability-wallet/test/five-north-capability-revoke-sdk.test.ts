import { APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID } from "@sotto/x402-canton";
import { expect, it, vi } from "vitest";
import {
  acquireFiveNorthCapabilityRevokePreparation,
  type RevokeSdkDependencies,
} from "../src/five-north-capability-revoke-sdk.js";
import {
  REVOKE_CAPABILITY,
  REVOKE_PAYER,
  REVOKE_SYNCHRONIZER,
} from "./five-north-capability-revoke.fixtures.js";

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

it("prepares and executes only the exact payer revoke", async () => {
  const response = {
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2" as const,
    preparedTransaction: "AA==",
    preparedTransactionHash: Buffer.alloc(32, 7).toString("base64"),
  };
  const signed = { signed: true };
  const prepare = vi.fn(() => ({
    preparedPromise: Promise.resolve(response),
    toJSON: async () => ({ response }),
  }));
  const fromSignature = vi.fn(() => signed);
  const execute = vi.fn(async () => ({
    completionOffset: 45,
    updateId: "1220revoke-update",
  }));
  const createSdk = vi.fn(
    async (config: Parameters<RevokeSdkDependencies["createSdk"]>[0]) => {
      void config;
      return { ledger: { execute, fromSignature, prepare } };
    },
  );
  const signal = new AbortController().signal;
  const prepareRevoke = await acquireFiveNorthCapabilityRevokePreparation(
    environment,
    signal,
    { createSdk },
  );
  const submissionId = `sotto-capability-revoke-v1-${"a".repeat(64)}`;
  const dispatch = await prepareRevoke({
    capabilityContractId: REVOKE_CAPABILITY,
    payerParty: REVOKE_PAYER,
    signal,
    submissionId,
    synchronizerId: REVOKE_SYNCHRONIZER,
  });
  await dispatch.execute("wallet-signature");

  expect(prepare).toHaveBeenCalledWith({
    commandId: submissionId,
    commands: {
      ExerciseCommand: {
        choice: "Revoke",
        choiceArgument: {},
        contractId: REVOKE_CAPABILITY,
        templateId: APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
      },
    },
    partyId: REVOKE_PAYER,
    synchronizerId: REVOKE_SYNCHRONIZER,
  });
  expect(fromSignature).toHaveBeenCalledWith(response, "wallet-signature");
  expect(execute).toHaveBeenCalledWith(signed, {
    partyId: REVOKE_PAYER,
    submissionId,
  });
});
