import { spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import type { CapabilityWalletRegisteredPublicKeyQuery } from "@sotto/x402-canton";
import type { ReferenceWalletPublicIdentity } from "@sotto/capability-wallet";

const MAXIMUM_OUTPUT_BYTES = 64 * 1024;
const HANDOFF_ID = /^[0-9a-f]{64}$/u;
const FINGERPRINT = /^1220[0-9a-f]{64}$/u;

function walletEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    ["HOME", "PATH", "TMPDIR"].flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

async function runWalletChild(input: {
  arguments: string[];
  script: string;
  signal: AbortSignal;
  workspaceRoot: string;
}): Promise<string> {
  if (!isAbsolute(input.workspaceRoot) || input.signal.aborted) {
    throw new Error("reference wallet child scope is invalid");
  }
  return new Promise((resolveOutput, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", input.script, ...input.arguments],
      {
        cwd: input.workspaceRoot,
        env: walletEnvironment(),
        signal: input.signal,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = Buffer.alloc(0);
    let errorBytes = 0;
    let oversized = false;
    const fail = () => {
      oversized = true;
      child.kill("SIGKILL");
    };
    child.stdout.on("data", (chunk: Buffer) => {
      output = Buffer.concat([output, chunk]);
      if (output.byteLength > MAXIMUM_OUTPUT_BYTES) fail();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errorBytes += chunk.byteLength;
      if (errorBytes > MAXIMUM_OUTPUT_BYTES) fail();
    });
    child.once("error", () =>
      reject(new Error("reference wallet child process failed")),
    );
    child.once("close", (code) => {
      if (oversized || code !== 0) {
        reject(new Error("reference wallet child process failed"));
        return;
      }
      resolveOutput(output.toString("utf8"));
    });
    child.stdin.end();
  });
}

type InteractiveInput = Readonly<{
  arguments: string[];
  script: string;
  signal: AbortSignal;
  workspaceRoot: string;
}>;

async function runWalletInteractive(input: InteractiveInput): Promise<void> {
  if (!isAbsolute(input.workspaceRoot) || input.signal.aborted) {
    throw new Error("reference wallet interactive scope is invalid");
  }
  await new Promise<void>((resolveChild, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", input.script, ...input.arguments],
      {
        cwd: input.workspaceRoot,
        env: walletEnvironment(),
        signal: input.signal,
        stdio: "inherit",
      },
    );
    child.once("error", () =>
      reject(new Error("reference wallet interactive process failed")),
    );
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error("reference wallet interactive process failed"));
        return;
      }
      resolveChild();
    });
  });
}

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
    runInteractive: (input: InteractiveInput) => Promise<void>;
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
