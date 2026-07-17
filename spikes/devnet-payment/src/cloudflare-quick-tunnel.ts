import { spawn } from "node:child_process";
import type { Readable } from "node:stream";

const CLOUDFLARED = "/opt/homebrew/bin/cloudflared";
const MAX_STARTUP_LOG_BYTES = 131_072;
const STARTUP_TIMEOUT_MS = 30_000;
const URL_PATTERN = /https:\/\/[A-Za-z0-9.-]+\.trycloudflare\.com/gu;
const RATE_LIMIT_PATTERN =
  /(?:\b429\b|too many requests|rate[- ]limited|rate[- ]limit\s+(?:exceeded|reached))/iu;
const authenticRateLimitErrors = new WeakSet<object>();

export class CloudflareQuickTunnelRateLimitError extends Error {
  constructor() {
    super("Cloudflare quick tunnel rate limited");
    authenticRateLimitErrors.add(this);
  }
}

export function isCloudflareQuickTunnelRateLimitError(
  value: unknown,
): value is CloudflareQuickTunnelRateLimitError {
  return (
    typeof value === "object" &&
    value !== null &&
    authenticRateLimitErrors.has(value)
  );
}

export interface CloudflareTunnelProcess {
  readonly stdout: Readable;
  readonly stderr: Readable;
  readonly exitCode: number | null;
  kill(signal: NodeJS.Signals): boolean;
  on(event: "error", listener: (error: Error) => void): this;
  once(
    event: "close" | "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  off(event: "error", listener: (error: Error) => void): this;
  off(
    event: "close" | "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
}

type Dependencies = Readonly<{
  spawnProcess: (
    command: string,
    arguments_: readonly string[],
  ) => CloudflareTunnelProcess;
}>;

export type CloudflareQuickTunnel = Readonly<{
  close: () => Promise<void>;
  origin: `https://${string}.trycloudflare.com`;
}>;

export function parseCloudflareQuickTunnelOrigin(source: string) {
  const candidates = new Set(source.match(URL_PATTERN) ?? []);
  if (candidates.size !== 1) {
    throw new Error("Cloudflare quick tunnel requires one public origin");
  }
  const candidate = [...candidates][0]!;
  const url = new URL(candidate);
  const labels = url.hostname.split(".");
  const label = labels[0] ?? "";
  if (
    url.protocol !== "https:" ||
    url.origin !== candidate ||
    labels.length !== 3 ||
    labels[1] !== "trycloudflare" ||
    labels[2] !== "com" ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label)
  ) {
    throw new Error("Cloudflare quick tunnel origin is not approved");
  }
  return candidate as `https://${string}.trycloudflare.com`;
}

function stopProcess(process: CloudflareTunnelProcess): Promise<void> {
  if (process.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(forceTimer);
      clearTimeout(giveUpTimer);
      process.off("exit", onExit);
      resolve();
    };
    const onExit = () => finish();
    const forceTimer = setTimeout(() => process.kill("SIGKILL"), 5_000);
    const giveUpTimer = setTimeout(finish, 7_000);
    process.once("exit", onExit);
    process.kill("SIGTERM");
  });
}

export async function startCloudflareQuickTunnel(
  input: Readonly<{ port: number; signal: AbortSignal }>,
  dependencies: Dependencies = {
    spawnProcess: (command, arguments_) =>
      spawn(command, [...arguments_], {
        stdio: ["ignore", "pipe", "pipe"],
      }),
  },
): Promise<CloudflareQuickTunnel> {
  if (
    !Number.isInteger(input.port) ||
    input.port < 1_024 ||
    input.port > 65_535 ||
    !(input.signal instanceof AbortSignal)
  ) {
    throw new Error("Cloudflare quick tunnel input is invalid");
  }
  if (input.signal.aborted) {
    throw new Error("Cloudflare quick tunnel cancelled");
  }
  const child = dependencies.spawnProcess(CLOUDFLARED, [
    "tunnel",
    "--no-autoupdate",
    "--url",
    `http://127.0.0.1:${input.port}`,
  ]);
  return await new Promise<CloudflareQuickTunnel>((resolve, reject) => {
    let sourceBytes = 0;
    let stderrSource = "";
    let stdoutSource = "";
    let settled = false;
    const combinedSource = () => `${stdoutSource}\n${stderrSource}`;
    const cleanup = () => {
      clearTimeout(timer);
      input.signal.removeEventListener("abort", onAbort);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("error", onError);
      child.off("close", onClose);
    };
    const fail = (failure: string | Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      const error = typeof failure === "string" ? new Error(failure) : failure;
      void stopProcess(child).then(() => reject(error));
    };
    const onAbort = () => fail("Cloudflare quick tunnel cancelled");
    const onError = () => fail("Cloudflare quick tunnel failed to start");
    const onClose = () =>
      fail(
        RATE_LIMIT_PATTERN.test(stderrSource)
          ? new CloudflareQuickTunnelRateLimitError()
          : "Cloudflare quick tunnel exited before ready",
      );
    const onData = (stream: "stderr" | "stdout", chunk: Buffer | string) => {
      if (settled) return;
      const text = chunk.toString();
      sourceBytes += Buffer.byteLength(text, "utf8");
      if (sourceBytes > MAX_STARTUP_LOG_BYTES) {
        fail("Cloudflare quick tunnel startup log is oversized");
        return;
      }
      if (stream === "stderr") stderrSource += text;
      else stdoutSource += text;
      const source = combinedSource();
      if (!source.includes(".trycloudflare.com")) return;
      let origin: `https://${string}.trycloudflare.com`;
      try {
        origin = parseCloudflareQuickTunnelOrigin(source);
      } catch {
        fail("Cloudflare quick tunnel origin is invalid");
        return;
      }
      settled = true;
      cleanup();
      child.stdout.resume();
      child.stderr.resume();
      let closePromise: Promise<void> | undefined;
      resolve(
        Object.freeze({
          origin,
          close: () => (closePromise ??= stopProcess(child)),
        }),
      );
    };
    const onStderr = (chunk: Buffer | string) => onData("stderr", chunk);
    const onStdout = (chunk: Buffer | string) => onData("stdout", chunk);
    const timer = setTimeout(
      () => fail("Cloudflare quick tunnel startup deadline exceeded"),
      STARTUP_TIMEOUT_MS,
    );
    input.signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.on("error", onError);
    child.once("close", onClose);
  });
}
