import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  loadVerifiedSottoControlDar,
  type VerifiedSottoControlDar,
} from "./five-north-dar-artifact.js";
import {
  formatFiveNorthPackageDeploymentResult,
  type FiveNorthPackageDeploymentResult,
} from "./five-north-package-deployment-output.js";
import { startJournaledFiveNorthPackageDeployment } from "./five-north-package-deployment-journal-runner.js";
import { createFiveNorthPackageDeploymentTransport } from "./five-north-package-deployment-transport.js";
import type { FiveNorthPackageDeploymentTransport } from "./five-north-package-deployment.js";
import { readFiveNorthNetworkConfig, type SpikeConfig } from "./config.js";

type Environment = Readonly<Record<string, string | undefined>>;
type LiveSottoControlPackageInput = Readonly<{
  createTransport: (
    network: SpikeConfig["network"],
    options: Readonly<{ signal: AbortSignal }>,
  ) => FiveNorthPackageDeploymentTransport;
  environment: Environment;
  loadArtifact: (input: {
    workspaceRoot: string;
  }) => Promise<VerifiedSottoControlDar>;
  loadEnvironment: (path: string) => void;
  start: (input: {
    artifact: VerifiedSottoControlDar;
    transport: FiveNorthPackageDeploymentTransport;
    workspaceRoot: string;
  }) => Promise<FiveNorthPackageDeploymentResult>;
  workspaceRoot: string;
  write: (output: string) => unknown;
}>;

export async function runLiveSottoControlPackage(
  input: LiveSottoControlPackageInput,
): Promise<void> {
  input.loadEnvironment(resolve(input.workspaceRoot, ".env.local"));
  const network = readFiveNorthNetworkConfig(input.environment);
  const artifact = await input.loadArtifact({
    workspaceRoot: input.workspaceRoot,
  });
  const scope = new AbortController();
  const transport = input.createTransport(network, { signal: scope.signal });
  try {
    const result = await input.start({
      artifact,
      transport,
      workspaceRoot: input.workspaceRoot,
    });
    input.write(formatFiveNorthPackageDeploymentResult(result));
  } finally {
    scope.abort();
  }
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && resolve(process.argv[1]) === modulePath) {
  const workspaceRoot = resolve(
    fileURLToPath(new URL("../../..", import.meta.url)),
  );
  await runLiveSottoControlPackage({
    createTransport: createFiveNorthPackageDeploymentTransport,
    environment: process.env,
    loadArtifact: loadVerifiedSottoControlDar,
    loadEnvironment: loadEnvFile,
    start: startJournaledFiveNorthPackageDeployment,
    workspaceRoot,
    write: (output) => process.stdout.write(output),
  });
}
