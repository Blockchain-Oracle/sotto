import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  runFiveNorthExternalPayerTap,
  type FiveNorthExternalPayerTapRunDependencies,
  type FiveNorthExternalPayerTapRunInput,
} from "./five-north-external-payer-tap-runner.js";
import {
  acquireFiveNorthExternalPayerTapPreparation,
  type TapSdkDependencies,
} from "./five-north-external-payer-tap-sdk.js";
import type { ExternalPayerEnvironment } from "./five-north-external-payer-sdk.js";

type CliInput = Readonly<{
  arguments: ReadonlyArray<string>;
  environment: ExternalPayerEnvironment;
  signal: AbortSignal;
}>;

type CliDependencies = Readonly<{
  acquirePreparation: (
    environment: ExternalPayerEnvironment,
    signal: AbortSignal,
    dependencies?: TapSdkDependencies,
  ) => Promise<FiveNorthExternalPayerTapRunDependencies["prepareTap"]>;
  runTap: (
    input: FiveNorthExternalPayerTapRunInput,
    dependencies: FiveNorthExternalPayerTapRunDependencies,
  ) => Promise<unknown>;
}>;

const FLAGS = new Set([
  "--expected-fingerprint",
  "--key-file",
  "--payer-party",
  "--synchronizer-id",
]);

function argumentsFor(values: ReadonlyArray<string>) {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (
      name === undefined ||
      value === undefined ||
      !FLAGS.has(name) ||
      parsed.has(name) ||
      value === "" ||
      value.startsWith("--")
    ) {
      throw new Error("external payer tap CLI arguments are invalid");
    }
    parsed.set(name, value);
  }
  if (parsed.size !== FLAGS.size) {
    throw new Error("external payer tap CLI required arguments are missing");
  }
  return {
    expectedFingerprint: parsed.get("--expected-fingerprint")!,
    keyFile: parsed.get("--key-file")!,
    payerParty: parsed.get("--payer-party")!,
    synchronizerId: parsed.get("--synchronizer-id")!,
  };
}

function submissionId(input: {
  expectedFingerprint: string;
  payerParty: string;
  synchronizerId: string;
}): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        amount: "1.0000000000",
        expectedFingerprint: input.expectedFingerprint,
        payerParty: input.payerParty,
        synchronizerId: input.synchronizerId,
        version: "sotto-external-payer-tap-v1",
      }),
    )
    .digest("hex");
  return `sotto-external-payer-tap-v1-${digest}`;
}

export async function runFiveNorthExternalPayerTapCli(
  input: CliInput,
  dependencies: CliDependencies = {
    acquirePreparation: acquireFiveNorthExternalPayerTapPreparation,
    runTap: runFiveNorthExternalPayerTap,
  },
): Promise<unknown> {
  const parsed = argumentsFor(input.arguments);
  if (!(input.signal instanceof AbortSignal) || input.signal.aborted) {
    throw new Error("external payer tap cancelled");
  }
  const prepareTap = await dependencies.acquirePreparation(
    input.environment,
    input.signal,
  );
  return dependencies.runTap(
    {
      amount: "1.0000000000",
      expectedFingerprint: parsed.expectedFingerprint,
      keyFile: parsed.keyFile,
      payerParty: parsed.payerParty,
      signal: input.signal,
      submissionId: submissionId(parsed),
      synchronizerId: parsed.synchronizerId,
    },
    { prepareTap },
  );
}

async function main(): Promise<void> {
  const workspaceRoot = resolve(
    fileURLToPath(new URL("../../..", import.meta.url)),
  );
  loadEnvFile(resolve(workspaceRoot, ".env.local"));
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timeout = setTimeout(cancel, 300_000);
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const result = await runFiveNorthExternalPayerTapCli({
      arguments: process.argv.slice(2),
      environment: process.env,
      signal: controller.signal,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    clearTimeout(timeout);
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main().catch(() => {
    console.error("Five North external payer tap failed");
    process.exitCode = 1;
  });
}
