import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  runFiveNorthCapabilityRevoke,
  type FiveNorthCapabilityRevokeRunInput,
} from "./five-north-capability-revoke-runner.js";
import { acquireFiveNorthCapabilityRevokePreparation } from "./five-north-capability-revoke-sdk.js";

const FLAGS = [
  "--agent-party",
  "--capability-contract-id",
  "--expected-fingerprint",
  "--key-file",
  "--payer-party",
  "--synchronizer-id",
] as const;

function parse(arguments_: readonly string[]) {
  const values = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  const result = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (
      name === undefined ||
      value === undefined ||
      !FLAGS.includes(name as (typeof FLAGS)[number]) ||
      result.has(name) ||
      value === "" ||
      value.startsWith("--")
    ) {
      throw new Error("capability revoke CLI arguments are invalid");
    }
    result.set(name, value);
  }
  if (result.size !== FLAGS.length) {
    throw new Error("capability revoke CLI required arguments are missing");
  }
  return {
    agentParty: result.get("--agent-party")!,
    capabilityContractId: result.get("--capability-contract-id")!,
    expectedFingerprint: result.get("--expected-fingerprint")!,
    keyFile: result.get("--key-file")!,
    payerParty: result.get("--payer-party")!,
    synchronizerId: result.get("--synchronizer-id")!,
  };
}

function submissionId(input: ReturnType<typeof parse>): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        capabilityContractId: input.capabilityContractId,
        payerParty: input.payerParty,
        synchronizerId: input.synchronizerId,
        version: "sotto-capability-revoke-v1",
      }),
    )
    .digest("hex");
  return `sotto-capability-revoke-v1-${digest}`;
}

export async function runFiveNorthCapabilityRevokeCli(
  arguments_: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
  signal: AbortSignal,
): Promise<unknown> {
  const input = parse(arguments_);
  const prepareRevoke = await acquireFiveNorthCapabilityRevokePreparation(
    environment,
    signal,
  );
  return runFiveNorthCapabilityRevoke(
    {
      ...input,
      signal,
      submissionId: submissionId(input),
    } satisfies FiveNorthCapabilityRevokeRunInput,
    { prepareRevoke },
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
    const result = await runFiveNorthCapabilityRevokeCli(
      process.argv.slice(2),
      process.env,
      controller.signal,
    );
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
    console.error("Five North capability revoke failed");
    process.exitCode = 1;
  });
}
