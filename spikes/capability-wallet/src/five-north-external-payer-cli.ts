import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { CustomLogAdapter, SDK } from "@canton-network/wallet-sdk";
import { runFiveNorthExternalPayer } from "./five-north-external-payer.js";
import type {
  ExternalPartyCreator,
  FiveNorthExternalPayerResult,
} from "./five-north-external-payer-types.js";

type Environment = Readonly<Record<string, string | undefined>>;
type CliInput = Readonly<{
  arguments: ReadonlyArray<string>;
  environment: Environment;
  signal: AbortSignal;
}>;
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
type OnlineSdk = Readonly<{
  party: { external: { create: ExternalPartyCreator } };
}>;
type Dependencies = Readonly<{
  createSdk: (config: SdkConfig) => Promise<OnlineSdk>;
}>;

const VALUE_FLAGS = new Set([
  "--expected-fingerprint",
  "--key-file",
  "--party-hint",
  "--synchronizer-id",
]);

function parseArguments(arguments_: ReadonlyArray<string>) {
  const values = new Map<string, string>();
  let live = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const name = arguments_[index]!;
    if (name === "--live-onboard") {
      if (live) throw new Error("external payer live flag is duplicated");
      live = true;
      continue;
    }
    if (!VALUE_FLAGS.has(name) || values.has(name)) {
      throw new Error("external payer CLI arguments are invalid");
    }
    const value = arguments_[index + 1];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new Error(`external payer CLI ${name} value is missing`);
    }
    values.set(name, value);
    index += 1;
  }
  const keyFile = values.get("--key-file");
  const partyHint = values.get("--party-hint");
  const synchronizerId = values.get("--synchronizer-id");
  if (
    keyFile === undefined ||
    partyHint === undefined ||
    synchronizerId === undefined
  ) {
    throw new Error("external payer CLI required arguments are missing");
  }
  return {
    expectedFingerprint: values.get("--expected-fingerprint"),
    keyFile,
    mode: live ? ("live" as const) : ("dry-run" as const),
    partyHint,
    synchronizerId,
  };
}

function required(environment: Environment, name: string): string {
  const value = environment[name];
  if (value === undefined || value === "" || value.trim() !== value) {
    throw new Error(`external payer environment requires ${name}`);
  }
  return value;
}

function httpsUrl(environment: Environment, name: string): string {
  const url = new URL(required(environment, name));
  if (url.protocol !== "https:") {
    throw new Error(`external payer ${name} must use HTTPS`);
  }
  return url.toString();
}

function sdkConfig(environment: Environment): SdkConfig {
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

async function createOnlineSdk(config: SdkConfig): Promise<OnlineSdk> {
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

export async function runFiveNorthExternalPayerCli(
  input: CliInput,
  dependencies: Dependencies = { createSdk: createOnlineSdk },
): Promise<FiveNorthExternalPayerResult> {
  const parsed = parseArguments(input.arguments);
  const sdk = await dependencies.createSdk(sdkConfig(input.environment));
  return runFiveNorthExternalPayer(
    {
      ...(parsed.expectedFingerprint === undefined
        ? {}
        : { expectedFingerprint: parsed.expectedFingerprint }),
      keyFile: parsed.keyFile,
      mode: parsed.mode,
      partyHint: parsed.partyHint,
      signal: input.signal,
      synchronizerId: parsed.synchronizerId,
    },
    { createExternalParty: sdk.party.external.create },
  );
}

async function main(): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    const result = await runFiveNorthExternalPayerCli({
      arguments: process.argv.slice(2),
      environment: process.env,
      signal: controller.signal,
    });
    console.log(JSON.stringify(result));
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main().catch(() => {
    console.error("Five North external payer command failed");
    process.exitCode = 1;
  });
}
