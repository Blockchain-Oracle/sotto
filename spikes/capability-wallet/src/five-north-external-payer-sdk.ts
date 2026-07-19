import { CustomLogAdapter, SDK } from "@canton-network/wallet-sdk";
import type { ExternalPartyCreator } from "./five-north-external-payer-types.js";

export type ExternalPayerEnvironment = Readonly<
  Record<string, string | undefined>
>;
type SdkConfig = Readonly<{
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
export type ExternalPayerOnlineSdk = Readonly<{
  party: { external: { create: ExternalPartyCreator } };
}>;
export type ExternalPayerSdkDependencies = Readonly<{
  createSdk: (config: SdkConfig) => Promise<ExternalPayerOnlineSdk>;
}>;

function required(environment: ExternalPayerEnvironment, name: string): string {
  const value = environment[name];
  if (value === undefined || value === "" || value.trim() !== value) {
    throw new Error(`external payer environment requires ${name}`);
  }
  return value;
}

function httpsUrl(environment: ExternalPayerEnvironment, name: string): string {
  const url = new URL(required(environment, name));
  if (url.protocol !== "https:") {
    throw new Error(`external payer ${name} must use HTTPS`);
  }
  return url.toString();
}

export function fiveNorthSdkConfig(
  environment: ExternalPayerEnvironment,
): SdkConfig {
  const issuer = httpsUrl(environment, "FIVE_NORTH_OIDC_ISSUER_URL");
  return {
    auth: {
      configUrl: `${issuer.replace(/\/$/u, "")}/.well-known/openid-configuration`,
      credentials: {
        audience: required(environment, "FIVE_NORTH_OIDC_AUDIENCE"),
        clientId: required(environment, "FIVE_NORTH_OIDC_CLIENT_ID"),
        clientSecret: required(environment, "FIVE_NORTH_OIDC_CLIENT_SECRET"),
        scope: required(environment, "FIVE_NORTH_OIDC_SCOPE"),
      },
      method: "client_credentials",
    },
    ledgerClientUrl: httpsUrl(environment, "FIVE_NORTH_LEDGER_URL"),
    logAdapter: new CustomLogAdapter(() => undefined),
  };
}

async function createOnlineSdk(
  config: SdkConfig,
): Promise<ExternalPayerOnlineSdk> {
  const sdk = await SDK.create(config);
  return {
    party: {
      external: {
        create: (publicKey, options) =>
          sdk.party.external.create(publicKey as never, options),
      },
    },
  };
}

export function acquireFiveNorthSdk(
  environment: ExternalPayerEnvironment,
  signal: AbortSignal,
  dependencies: ExternalPayerSdkDependencies = { createSdk: createOnlineSdk },
): Promise<ExternalPayerOnlineSdk> {
  const config = fiveNorthSdkConfig(environment);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () =>
      finish(() => reject(new Error("external payer onboarding cancelled")));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    void dependencies.createSdk(config).then(
      (sdk) => finish(() => resolve(sdk)),
      () =>
        finish(() =>
          reject(new Error("external payer SDK initialization failed")),
        ),
    );
  });
}
