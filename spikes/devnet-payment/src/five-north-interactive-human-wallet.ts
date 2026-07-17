import { resolve } from "node:path";
import {
  createReferenceHumanWalletConnector,
  createWalletHandoffStorage,
  type ReferenceWalletPublicIdentity,
  type WalletHandoffStorage,
} from "@sotto/capability-wallet";
import type { HumanWalletConnector } from "@sotto/x402-canton";
import { createFiveNorthHumanWalletCapabilities } from "./five-north-reference-human-wallet.js";
import type { FiveNorthHumanWalletProfile } from "./five-north-human-wallet-profile.js";
import {
  createReferenceHumanWalletInteractiveExchange,
  registeredReferenceHumanWalletKeyResolver,
  type ReferenceHumanWalletChildExchange,
} from "./reference-human-wallet-child-process.js";
import { readReferenceWalletChildIdentity } from "./reference-wallet-child-process.js";

type Input = Readonly<{
  keyFile: string;
  profile: FiveNorthHumanWalletProfile;
  signal: AbortSignal;
  workspaceRoot: string;
}>;

type Dependencies = Readonly<{
  createConnector: (input: {
    capabilities: ReturnType<typeof createFiveNorthHumanWalletCapabilities>;
    exchange: ReferenceHumanWalletChildExchange;
    storage: WalletHandoffStorage;
  }) => HumanWalletConnector;
  createExchange: typeof createReferenceHumanWalletInteractiveExchange;
  createStorage: typeof createWalletHandoffStorage;
  readIdentity: typeof readReferenceWalletChildIdentity;
}>;

export type FiveNorthInteractiveHumanWallet = Readonly<{
  connector: HumanWalletConnector;
  resolveRegisteredPublicKey: ReturnType<
    typeof registeredReferenceHumanWalletKeyResolver
  >;
}>;

function requireActive(signal: unknown): asserts signal is AbortSignal {
  if (!(signal instanceof AbortSignal) || signal.aborted) {
    throw new Error("Five North interactive human wallet was cancelled");
  }
}

export async function createFiveNorthInteractiveHumanWallet(
  input: Input,
  dependencies: Dependencies = {
    createConnector: createReferenceHumanWalletConnector,
    createExchange: createReferenceHumanWalletInteractiveExchange,
    createStorage: createWalletHandoffStorage,
    readIdentity: readReferenceWalletChildIdentity,
  },
): Promise<FiveNorthInteractiveHumanWallet> {
  requireActive(input.signal);
  const rootDirectory = resolve(input.workspaceRoot, ".capability-wallet");
  const identity: ReferenceWalletPublicIdentity =
    await dependencies.readIdentity({
      expectedFingerprint: input.profile.fingerprint,
      keyFile: input.keyFile,
      signal: input.signal,
      workspaceRoot: input.workspaceRoot,
    });
  requireActive(input.signal);
  const storage = await dependencies.createStorage({ rootDirectory });
  requireActive(input.signal);
  const exchange = dependencies.createExchange({
    keyFile: input.keyFile,
    rootDirectory,
    workspaceRoot: input.workspaceRoot,
  });
  return Object.freeze({
    connector: dependencies.createConnector({
      capabilities: createFiveNorthHumanWalletCapabilities(input.profile),
      exchange,
      storage,
    }),
    resolveRegisteredPublicKey: registeredReferenceHumanWalletKeyResolver({
      identity,
      profile: input.profile,
    }),
  });
}
