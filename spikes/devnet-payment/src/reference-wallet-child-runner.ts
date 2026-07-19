import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";

const MAXIMUM_OUTPUT_BYTES = 64 * 1024;

function walletEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    ["HOME", "PATH", "TMPDIR"].flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

export type WalletChildInput = Readonly<{
  arguments: string[];
  script: string;
  signal: AbortSignal;
  workspaceRoot: string;
}>;

export async function runWalletChild(input: WalletChildInput): Promise<string> {
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

export async function runWalletInteractive(
  input: WalletChildInput,
): Promise<void> {
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
