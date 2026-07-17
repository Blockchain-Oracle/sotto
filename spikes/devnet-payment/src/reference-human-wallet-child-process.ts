import { resolve } from "node:path";
import {
  runWalletChild,
  runWalletInteractive,
  type WalletChildInput,
} from "./reference-wallet-child-runner.js";

const HANDOFF_ID = /^[0-9a-f]{64}$/u;

type CommonInput = Readonly<{
  rootDirectory: string;
  workspaceRoot: string;
}>;

export type ReferenceHumanWalletChildExchange = (
  handoffId: string,
  options: Readonly<{ signal: AbortSignal }>,
) => Promise<void>;

function requireHandoffId(value: string): void {
  if (!HANDOFF_ID.test(value)) {
    throw new Error("reference human wallet handoff ID is invalid");
  }
}

function script(workspaceRoot: string): string {
  return resolve(
    workspaceRoot,
    "spikes/capability-wallet/src/reference-human-wallet-cli.ts",
  );
}

export function createReferenceHumanWalletInteractiveExchange(
  input: CommonInput & Readonly<{ keyFile: string }>,
  dependencies: Readonly<{
    runInteractive: (input: WalletChildInput) => Promise<void>;
  }> = { runInteractive: runWalletInteractive },
): ReferenceHumanWalletChildExchange {
  return async (handoffId: string, options: { signal: AbortSignal }) => {
    requireHandoffId(handoffId);
    await dependencies.runInteractive({
      arguments: [
        "--root",
        input.rootDirectory,
        "--handoff-id",
        handoffId,
        "--approve",
        "--key-file",
        input.keyFile,
      ],
      script: script(input.workspaceRoot),
      signal: options.signal,
      workspaceRoot: input.workspaceRoot,
    });
  };
}

export function createReferenceHumanWalletRejectExchange(
  input: CommonInput,
  dependencies: Readonly<{
    runChild: (input: WalletChildInput) => Promise<string>;
  }> = { runChild: runWalletChild },
): ReferenceHumanWalletChildExchange {
  return async (handoffId: string, options: { signal: AbortSignal }) => {
    requireHandoffId(handoffId);
    await dependencies.runChild({
      arguments: [
        "--root",
        input.rootDirectory,
        "--handoff-id",
        handoffId,
        "--reject",
      ],
      script: script(input.workspaceRoot),
      signal: options.signal,
      workspaceRoot: input.workspaceRoot,
    });
  };
}
