import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readCleanSourceCheckpoint } from "./clean-source-checkpoint.js";
import { readFiveNorthNetworkConfig } from "./config.js";
import { readinessParty } from "./five-north-capability-readiness-validation.js";
import { projectLiveFiveNorthHumanPrepareFailure } from "./live-five-north-human-prepare-failure.js";
import { projectLiveFiveNorthHumanPrepareOutput } from "./live-five-north-human-prepare-output.js";
import { runLiveFiveNorthHumanPrepare } from "./live-five-north-human-prepare.js";

const PORT = 8_791;

async function main(): Promise<void> {
  const workspaceRoot = resolve(
    fileURLToPath(new URL("../../..", import.meta.url)),
  );
  const sourceCommit = await readCleanSourceCheckpoint(workspaceRoot);
  loadEnvFile(resolve(workspaceRoot, ".env.local"));
  const network = readFiveNorthNetworkConfig(process.env);
  const providerParty = readinessParty(
    process.env.PROVIDER_PARTY,
    "human provider",
    true,
  );
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    const result = await runLiveFiveNorthHumanPrepare({
      keyFile: resolve(
        workspaceRoot,
        ".capability-wallet/five-north-external-payer.key",
      ),
      network,
      port: PORT,
      providerParty,
      signal: controller.signal,
      workspaceRoot,
    });
    process.stdout.write(
      `${JSON.stringify(
        projectLiveFiveNorthHumanPrepareOutput(sourceCommit, result),
        null,
        2,
      )}\n`,
    );
  } finally {
    controller.abort();
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main().catch((error: unknown) => {
    console.error(projectLiveFiveNorthHumanPrepareFailure(error));
    process.exitCode = 1;
  });
}
