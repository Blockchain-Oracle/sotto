import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { runFiveNorthExternalPayer } from "./five-north-external-payer.js";
import {
  acquireFiveNorthSdk,
  type ExternalPayerEnvironment,
  type ExternalPayerSdkDependencies,
} from "./five-north-external-payer-sdk.js";
import type { FiveNorthExternalPayerResult } from "./five-north-external-payer-types.js";

type CliInput = Readonly<{
  arguments: ReadonlyArray<string>;
  environment: ExternalPayerEnvironment;
  signal: AbortSignal;
}>;

const VALUE_FLAGS = new Set([
  "--expected-fingerprint",
  "--key-file",
  "--party-hint",
  "--synchronizer-id",
]);
const FINGERPRINT_PATTERN = /^1220[0-9a-f]{64}$/u;

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
  const expectedFingerprint = values.get("--expected-fingerprint");
  if (
    (live &&
      (expectedFingerprint === undefined ||
        !FINGERPRINT_PATTERN.test(expectedFingerprint))) ||
    (!live && expectedFingerprint !== undefined)
  ) {
    throw new Error("external payer CLI fingerprint approval is invalid");
  }
  return {
    expectedFingerprint,
    keyFile,
    mode: live ? ("live" as const) : ("dry-run" as const),
    partyHint,
    synchronizerId,
  };
}

export async function runFiveNorthExternalPayerCli(
  input: CliInput,
  dependencies?: ExternalPayerSdkDependencies,
): Promise<FiveNorthExternalPayerResult> {
  const parsed = parseArguments(input.arguments);
  if (!(input.signal instanceof AbortSignal) || input.signal.aborted) {
    throw new Error("external payer onboarding cancelled");
  }
  const sdk = await acquireFiveNorthSdk(
    input.environment,
    input.signal,
    dependencies,
  );
  if (input.signal.aborted) {
    throw new Error("external payer onboarding cancelled");
  }
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
