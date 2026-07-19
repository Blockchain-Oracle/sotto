import { spawn } from "node:child_process";

const MAX_OUTPUT_BYTES = 16_384;
const PROCESS_TIMEOUT_MS = 5_000;

export type WalletProcessResult = Readonly<{
  stderr: string;
  stdout: string;
}>;

export function runCompiledReferenceWallet(input: {
  cliPath: string;
  clockModuleUrl: string;
  handoffId: string;
  keyFile: string;
  rootDirectory: string;
}): Promise<WalletProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        input.clockModuleUrl,
        input.cliPath,
        "--root",
        input.rootDirectory,
        "--handoff-id",
        input.handoffId,
        "--approve",
        "--key-file",
        input.keyFile,
      ],
      {
        cwd: process.cwd(),
        env: { NODE_ENV: "test" },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let failure: Error | undefined;
    let sentApproval = false;
    let stderr = "";
    let stdout = "";
    let stderrBytes = 0;
    let stdoutBytes = 0;
    const fail = (error: Error) => {
      failure ??= error;
      child.kill("SIGKILL");
    };
    const timeout = setTimeout(
      () => fail(new Error("reference wallet process timed out")),
      PROCESS_TIMEOUT_MS,
    );
    child.stdin.on("error", () => undefined);
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > MAX_OUTPUT_BYTES) {
        fail(new Error("reference wallet stdout exceeded its bound"));
        return;
      }
      stdout += chunk.toString("utf8");
      const prompt = `Type the exact handoff ID ${input.handoffId} to approve:`;
      if (!sentApproval && stdout.includes(prompt)) {
        sentApproval = true;
        child.stdin.end(`${input.handoffId}\n`);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > MAX_OUTPUT_BYTES) {
        fail(new Error("reference wallet stderr exceeded its bound"));
        return;
      }
      stderr += chunk.toString("utf8");
    });
    child.once("error", (error) => {
      failure ??= error;
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      if (failure !== undefined) {
        reject(failure);
      } else if (!sentApproval) {
        reject(new Error("reference wallet approval prompt was not observed"));
      } else if (code !== 0 || signal !== null) {
        reject(
          new Error(
            `reference wallet process failed (${String(code)}/${String(signal)})`,
          ),
        );
      } else {
        resolve(Object.freeze({ stderr, stdout }));
      }
    });
  });
}
