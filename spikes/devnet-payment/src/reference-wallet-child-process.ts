import { resolve } from "node:path";
import type { CapabilityWalletRegisteredPublicKeyQuery } from "@sotto/x402-canton";
import type { ReferenceWalletPublicIdentity } from "@sotto/capability-wallet";
import {
  runWalletChild,
  runWalletInteractive,
  type WalletChildInput,
} from "./reference-wallet-child-runner.js";

const HANDOFF_ID = /^[0-9a-f]{64}$/u;
const FINGERPRINT = /^1220[0-9a-f]{64}$/u;

function identity(value: unknown): ReferenceWalletPublicIdentity {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("reference wallet public identity is invalid");
  }
  const record = value as Record<string, unknown>;
  const publicKey =
    typeof record.publicKey === "string"
      ? Buffer.from(record.publicKey, "base64")
      : Buffer.alloc(0);
  if (
    Object.keys(record).sort().join() !==
      "fingerprint,publicKey,publicKeyFormat" ||
    typeof record.fingerprint !== "string" ||
    !FINGERPRINT.test(record.fingerprint) ||
    record.publicKeyFormat !== "PUBLIC_KEY_FORMAT_RAW" ||
    publicKey.byteLength !== 32 ||
    publicKey.toString("base64") !== record.publicKey
  ) {
    throw new Error("reference wallet public identity is invalid");
  }
  return Object.freeze({
    fingerprint: record.fingerprint as `1220${string}`,
    publicKey: record.publicKey,
    publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW" as const,
  });
}

export async function readReferenceWalletChildIdentity(input: {
  expectedFingerprint: string;
  keyFile: string;
  signal: AbortSignal;
  workspaceRoot: string;
}): Promise<ReferenceWalletPublicIdentity> {
  const output = await runWalletChild({
    arguments: [
      "--key-file",
      input.keyFile,
      "--expected-fingerprint",
      input.expectedFingerprint,
    ],
    script: resolve(
      input.workspaceRoot,
      "spikes/capability-wallet/src/reference-wallet-public-identity-cli.ts",
    ),
    signal: input.signal,
    workspaceRoot: input.workspaceRoot,
  });
  const parsed = identity(JSON.parse(output));
  if (parsed.fingerprint !== input.expectedFingerprint) {
    throw new Error("reference wallet fingerprint does not match approval");
  }
  return parsed;
}

export function createReferenceWalletInteractiveExchange(
  input: Readonly<{
    keyFile: string;
    policyFile: string;
    rootDirectory: string;
    workspaceRoot: string;
  }>,
  dependencies: Readonly<{
    runInteractive: (input: WalletChildInput) => Promise<void>;
  }> = { runInteractive: runWalletInteractive },
) {
  return async (handoffId: string, options: { signal: AbortSignal }) => {
    if (!HANDOFF_ID.test(handoffId)) {
      throw new Error("reference wallet handoff ID is invalid");
    }
    await dependencies.runInteractive({
      arguments: [
        "--root",
        input.rootDirectory,
        "--handoff-id",
        handoffId,
        "--policy-file",
        input.policyFile,
        "--approve",
        "--key-file",
        input.keyFile,
      ],
      script: resolve(
        input.workspaceRoot,
        "spikes/capability-wallet/src/reference-wallet-cli.ts",
      ),
      signal: options.signal,
      workspaceRoot: input.workspaceRoot,
    });
  };
}

export function createReferenceWalletPolicyExchange(
  input: Readonly<{
    keyFile: string;
    policyFile: string;
    rootDirectory: string;
    workspaceRoot: string;
  }>,
  dependencies: Readonly<{
    runChild: (input: WalletChildInput) => Promise<string>;
  }> = { runChild: runWalletChild },
) {
  return async (handoffId: string, options: { signal: AbortSignal }) => {
    if (!HANDOFF_ID.test(handoffId)) {
      throw new Error("reference wallet handoff ID is invalid");
    }
    await dependencies.runChild({
      arguments: [
        "--root",
        input.rootDirectory,
        "--handoff-id",
        handoffId,
        "--policy-file",
        input.policyFile,
        "--policy-authorized",
        "--key-file",
        input.keyFile,
      ],
      script: resolve(
        input.workspaceRoot,
        "spikes/capability-wallet/src/reference-wallet-cli.ts",
      ),
      signal: options.signal,
      workspaceRoot: input.workspaceRoot,
    });
  };
}

export function registeredReferenceWalletKeyResolver(input: {
  identity: ReferenceWalletPublicIdentity;
  payerParty: string;
}) {
  return async (
    query: CapabilityWalletRegisteredPublicKeyQuery,
    options: { signal: AbortSignal },
  ) => {
    if (
      options.signal.aborted ||
      query.party !== input.payerParty ||
      query.signedBy !== input.identity.fingerprint ||
      query.signatureFormat !== "SIGNATURE_FORMAT_CONCAT" ||
      query.signingAlgorithm !== "SIGNING_ALGORITHM_SPEC_ED25519"
    ) {
      throw new Error("reference wallet registered key query does not match");
    }
    return input.identity;
  };
}
