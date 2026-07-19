import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { SpikeConfig } from "./config.js";
import { readCleanSourceCheckpoint } from "./clean-source-checkpoint.js";
import { readFiveNorthNetworkConfig } from "./config.js";
import { readinessParty } from "./five-north-capability-readiness-validation.js";
import {
  projectHumanPurchaseJournalInitialized,
  projectLiveFiveNorthHumanPurchaseOutput,
} from "./live-five-north-human-purchase-cli-output.js";
import { runLiveFiveNorthHumanPurchase } from "./live-five-north-human-purchase.js";

const PORT = 8_791;
const OPERATION_ID = /^sha256:[0-9a-f]{64}$/u;

type JournalIdentity = Readonly<{ operationId: string }>;
type StartInput = Readonly<{
  keyFile: string;
  network: SpikeConfig["network"];
  onJournalInitialized: (journal: JournalIdentity) => void | Promise<void>;
  port: number;
  providerParty: string;
  signal: AbortSignal;
  sourceCommit: string;
  workspaceRoot: string;
}>;
type RecoveryInput = Readonly<{
  network: SpikeConfig["network"];
  operationId: string;
  providerParty: string;
  signal: AbortSignal;
  sourceCommit: string;
  workspaceRoot: string;
}>;

export type LiveFiveNorthHumanPurchaseCliPlatform = {
  arguments: readonly string[];
  environment: Record<string, string | undefined>;
  loadEnvironment: (path: string) => void;
  onSignal: (name: "SIGINT" | "SIGTERM", listener: () => void) => void;
  removeSignal: (name: "SIGINT" | "SIGTERM", listener: () => void) => void;
  workspaceRoot: string;
  writeStdout: (line: string) => void;
};

export type LiveFiveNorthHumanPurchaseCliDependencies = {
  readCleanSourceCheckpoint: (workspaceRoot: string) => Promise<string>;
  readNetwork: (
    environment: Readonly<Record<string, string | undefined>>,
  ) => SpikeConfig["network"];
  readProviderParty: (value: unknown) => string;
  recover: (input: RecoveryInput) => Promise<unknown>;
  start: (input: StartInput) => Promise<unknown>;
};

type Mode =
  | Readonly<{ kind: "start" }>
  | Readonly<{ kind: "recover"; operationId: string }>;

function parseMode(arguments_: readonly string[]): Mode {
  if (arguments_.length === 1 && arguments_[0] === "start") {
    return Object.freeze({ kind: "start" });
  }
  if (arguments_.length === 2 && arguments_[0] === "recover") {
    const operationId = arguments_[1];
    if (operationId === undefined || !OPERATION_ID.test(operationId)) {
      throw new Error("human purchase recovery operation ID is invalid");
    }
    return Object.freeze({ kind: "recover", operationId });
  }
  throw new Error("human purchase CLI arguments or mode are invalid");
}

const DEFAULT_DEPENDENCIES: LiveFiveNorthHumanPurchaseCliDependencies = {
  readCleanSourceCheckpoint,
  readNetwork: readFiveNorthNetworkConfig,
  readProviderParty: (value) => readinessParty(value, "human provider", true),
  recover: async (input) => {
    const { recoverHumanPurchase } =
      await import("./human-purchase-recovery.js");
    return recoverHumanPurchase(input);
  },
  start: (input) => runLiveFiveNorthHumanPurchase(input),
};

function writeJson(
  platform: LiveFiveNorthHumanPurchaseCliPlatform,
  value: unknown,
) {
  platform.writeStdout(`${JSON.stringify(value)}\n`);
}

async function runStart(
  platform: LiveFiveNorthHumanPurchaseCliPlatform,
  dependencies: LiveFiveNorthHumanPurchaseCliDependencies,
  common: Omit<StartInput, "keyFile" | "onJournalInitialized" | "port">,
): Promise<void> {
  let announcedOperationId: string | undefined;
  const result = await dependencies.start({
    ...common,
    keyFile: resolve(
      common.workspaceRoot,
      ".capability-wallet/five-north-external-payer.key",
    ),
    onJournalInitialized: async ({ operationId }) => {
      if (announcedOperationId !== undefined) {
        throw new Error("human purchase journal was announced more than once");
      }
      const output = projectHumanPurchaseJournalInitialized(
        common.sourceCommit,
        operationId,
      );
      announcedOperationId = output.operationId;
      writeJson(platform, output);
    },
    port: PORT,
  });
  const output = projectLiveFiveNorthHumanPurchaseOutput(
    common.sourceCommit,
    result,
  );
  if (
    announcedOperationId === undefined ||
    announcedOperationId !== output.operationId
  ) {
    throw new Error("human purchase result operation does not match journal");
  }
  writeJson(platform, output);
}

export async function runLiveFiveNorthHumanPurchaseCli(
  platform: LiveFiveNorthHumanPurchaseCliPlatform,
  dependencies: LiveFiveNorthHumanPurchaseCliDependencies = DEFAULT_DEPENDENCIES,
): Promise<void> {
  const mode = parseMode(platform.arguments);
  const sourceCommit = await dependencies.readCleanSourceCheckpoint(
    platform.workspaceRoot,
  );
  platform.loadEnvironment(resolve(platform.workspaceRoot, ".env.local"));
  const network = dependencies.readNetwork(platform.environment);
  const providerParty = dependencies.readProviderParty(
    platform.environment.PROVIDER_PARTY,
  );
  const controller = new AbortController();
  const abort = () => controller.abort();
  platform.onSignal("SIGINT", abort);
  platform.onSignal("SIGTERM", abort);
  const common = {
    network,
    providerParty,
    signal: controller.signal,
    sourceCommit,
    workspaceRoot: platform.workspaceRoot,
  };
  try {
    if (mode.kind === "start") {
      await runStart(platform, dependencies, common);
      return;
    }
    const result = await dependencies.recover({
      ...common,
      operationId: mode.operationId,
    });
    writeJson(
      platform,
      projectLiveFiveNorthHumanPurchaseOutput(sourceCommit, result),
    );
  } finally {
    controller.abort();
    platform.removeSignal("SIGINT", abort);
    platform.removeSignal("SIGTERM", abort);
  }
}

async function main(): Promise<void> {
  await runLiveFiveNorthHumanPurchaseCli({
    arguments: process.argv.slice(2),
    environment: process.env,
    loadEnvironment: (path) => loadEnvFile(path),
    onSignal: (name, listener) => process.once(name, listener),
    removeSignal: (name, listener) => process.removeListener(name, listener),
    workspaceRoot: resolve(fileURLToPath(new URL("../../..", import.meta.url))),
    writeStdout: (line) => process.stdout.write(line),
  });
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main().catch(() => {
    console.error("Five North human purchase command failed");
    process.exitCode = 1;
  });
}
