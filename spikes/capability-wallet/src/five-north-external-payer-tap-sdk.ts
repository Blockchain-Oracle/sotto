import { CustomLogAdapter, SDK } from "@canton-network/wallet-sdk";
import type {
  FiveNorthExternalPayerTapRunDependencies,
  TapDispatch,
  TapPrepareResponse,
} from "./five-north-external-payer-tap-execution-validation.js";
import type { ExternalPayerEnvironment } from "./five-north-external-payer-sdk.js";

const ENDPOINTS = Object.freeze({
  audience: "validator-devnet-m2m",
  clientId: "validator-devnet-m2m",
  issuer:
    "https://auth.sandbox.fivenorth.io/application/o/validator-devnet-m2m/",
  ledger: "https://ledger-api.validator.devnet.sandbox.fivenorth.io/",
  scope: "daml_ledger_api",
  validator:
    "https://wallet.validator.devnet.sandbox.fivenorth.io/api/validator",
});

type TapSdkConfig = Readonly<{
  amulet: Readonly<{
    auth: unknown;
    registryUrl: URL;
    scanApiUrl: URL;
    validatorUrl: URL;
  }>;
  auth: Readonly<{
    configUrl: string;
    credentials: Readonly<{
      audience: string;
      clientId: string;
      clientSecret: string;
      scope: string;
    }>;
    method: "client_credentials";
  }>;
  ledgerClientUrl: string;
  logAdapter: CustomLogAdapter;
}>;

type PreparedTap = Readonly<{
  preparedPromise: Promise<unknown>;
  toJSON: () => Promise<Readonly<{ response: TapPrepareResponse }>>;
}>;

type TapOnlineSdk = Readonly<{
  amulet: {
    tap: (
      partyId: string,
      amount: string,
    ) => Promise<readonly [unknown, unknown]>;
  };
  ledger: {
    execute: (signed: unknown, options: unknown) => Promise<unknown>;
    fromSignature: (response: unknown, signature: string) => unknown;
    prepare: (options: unknown) => PreparedTap;
  };
}>;

export type TapSdkDependencies = Readonly<{
  createSdk: (config: TapSdkConfig) => Promise<TapOnlineSdk>;
}>;

function required(environment: ExternalPayerEnvironment, name: string): string {
  const value = environment[name];
  if (value === undefined || value === "" || value.trim() !== value) {
    throw new Error(`external payer tap environment requires ${name}`);
  }
  return value;
}

function exact(value: string, expected: string, label: string): void {
  if (value !== expected) {
    throw new Error(`${label} is not an approved Five North tap value`);
  }
}

export function fiveNorthTapSdkConfig(
  environment: ExternalPayerEnvironment,
): TapSdkConfig {
  const issuer = new URL(required(environment, "FIVE_NORTH_OIDC_ISSUER_URL"));
  const ledger = new URL(required(environment, "FIVE_NORTH_LEDGER_URL"));
  const validator = new URL(required(environment, "FIVE_NORTH_VALIDATOR_URL"));
  exact(issuer.toString(), ENDPOINTS.issuer, "OIDC issuer URL");
  exact(ledger.toString(), ENDPOINTS.ledger, "Ledger URL");
  exact(validator.toString(), ENDPOINTS.validator, "validator URL");
  const credentials = Object.freeze({
    audience: required(environment, "FIVE_NORTH_OIDC_AUDIENCE"),
    clientId: required(environment, "FIVE_NORTH_OIDC_CLIENT_ID"),
    clientSecret: required(environment, "FIVE_NORTH_OIDC_CLIENT_SECRET"),
    scope: required(environment, "FIVE_NORTH_OIDC_SCOPE"),
  });
  exact(credentials.audience, ENDPOINTS.audience, "OIDC audience");
  exact(credentials.clientId, ENDPOINTS.clientId, "OIDC client ID");
  exact(credentials.scope, ENDPOINTS.scope, "OIDC scope");
  const auth = Object.freeze({
    configUrl: `${issuer.toString().replace(/\/$/u, "")}/.well-known/openid-configuration`,
    credentials,
    method: "client_credentials" as const,
  });
  return Object.freeze({
    amulet: Object.freeze({
      auth,
      registryUrl: new URL(`${validator.toString()}/v0/scan-proxy`),
      scanApiUrl: validator,
      validatorUrl: validator,
    }),
    auth,
    ledgerClientUrl: ledger.toString(),
    logAdapter: new CustomLogAdapter(() => undefined),
  });
}

function active(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("external payer tap cancelled");
}

async function awaitActive<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  active(signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () =>
      finish(() => reject(new Error("external payer tap cancelled")));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) return onAbort();
    void promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

async function createOnlineSdk(config: TapSdkConfig): Promise<TapOnlineSdk> {
  return (await SDK.create(config as never)) as unknown as TapOnlineSdk;
}

export async function acquireFiveNorthExternalPayerTapPreparation(
  environment: ExternalPayerEnvironment,
  signal: AbortSignal,
  dependencies: TapSdkDependencies = { createSdk: createOnlineSdk },
): Promise<FiveNorthExternalPayerTapRunDependencies["prepareTap"]> {
  const sdk = await awaitActive(
    dependencies.createSdk(fiveNorthTapSdkConfig(environment)),
    signal,
  );
  return async (input): Promise<TapDispatch> => {
    active(input.signal);
    const [commands, disclosedContracts] = await awaitActive(
      sdk.amulet.tap(input.payerParty, input.amount),
      input.signal,
    );
    const prepared = sdk.ledger.prepare({
      commandId: input.submissionId,
      commands,
      disclosedContracts,
      partyId: input.payerParty,
      synchronizerId: input.synchronizerId,
    });
    const [rawResponse, json] = await awaitActive(
      Promise.all([prepared.preparedPromise, prepared.toJSON()]),
      input.signal,
    );
    return Object.freeze({
      execute: (signature: string) =>
        awaitActive(
          sdk.ledger.execute(sdk.ledger.fromSignature(rawResponse, signature), {
            partyId: input.payerParty,
            submissionId: input.submissionId,
          }),
          input.signal,
        ),
      response: json.response,
    });
  };
}
