import { resolve } from "node:path";
import type { HumanWalletRegisteredPublicKeyQuery } from "@sotto/x402-canton";
import type { ReferenceWalletPublicIdentity } from "@sotto/capability-wallet";
import type { FiveNorthHumanWalletProfile } from "./five-north-human-wallet-profile.js";
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

export function registeredReferenceHumanWalletKeyResolver(input: {
  identity: ReferenceWalletPublicIdentity;
  profile: FiveNorthHumanWalletProfile;
}) {
  const publicKey = Buffer.from(input.identity.publicKey, "base64");
  if (
    input.identity.fingerprint !== input.profile.fingerprint ||
    input.identity.publicKeyFormat !== input.profile.publicKeyFormat ||
    publicKey.byteLength !== 32 ||
    publicKey.toString("base64") !== input.identity.publicKey ||
    !input.profile.party.endsWith(`::${input.identity.fingerprint}`)
  ) {
    throw new Error("reference human wallet registered identity is invalid");
  }
  return async (
    query: HumanWalletRegisteredPublicKeyQuery,
    options: Readonly<{ signal: AbortSignal }>,
  ) => {
    if (
      !(options.signal instanceof AbortSignal) ||
      options.signal.aborted ||
      query.keyPurpose !== "SIGNING" ||
      query.network !== "canton:devnet" ||
      query.party !== input.profile.party ||
      query.publicKeyFormat !== input.identity.publicKeyFormat ||
      query.signatureFormat !== "SIGNATURE_FORMAT_CONCAT" ||
      query.signedBy !== input.identity.fingerprint ||
      query.signingAlgorithm !== "SIGNING_ALGORITHM_SPEC_ED25519" ||
      !/^sha256:[0-9a-f]{64}$/u.test(query.subjectHash) ||
      query.synchronizerId !== input.profile.synchronizerId ||
      query.topologyHash !== input.profile.topologyHash
    ) {
      throw new Error(
        "reference human wallet registered key query does not match",
      );
    }
    return input.identity;
  };
}
