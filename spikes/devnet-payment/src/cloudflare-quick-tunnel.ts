import { spawn } from "node:child_process";
import type { Readable } from "node:stream";

const CLOUDFLARED = "/opt/homebrew/bin/cloudflared";
const MAX_STARTUP_LOG_BYTES = 131_072;
const STARTUP_TIMEOUT_MS = 30_000;
const URL_PATTERN = /https:\/\/[A-Za-z0-9.-]+\.trycloudflare\.com/gu;

export interface CloudflareTunnelProcess {
  readonly stdout: Readable;
  readonly stderr: Readable;
  readonly exitCode: number | null;
  kill(signal: NodeJS.Signals): boolean;
  on(event: "error", listener: (error: Error) => void): this;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  off(event: "error", listener: (error: Error) => void): this;
  off(
    event: "exit",
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
    let source = "";
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      input.signal.removeEventListener("abort", onAbort);
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("error", onError);
      child.off("exit", onExit);
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      void stopProcess(child).then(() => reject(new Error(message)));
    };
    const onAbort = () => fail("Cloudflare quick tunnel cancelled");
    const onError = () => fail("Cloudflare quick tunnel failed to start");
    const onExit = () => fail("Cloudflare quick tunnel exited before ready");
    const onData = (chunk: Buffer | string) => {
      if (settled) return;
      source += chunk.toString();
      if (Buffer.byteLength(source, "utf8") > MAX_STARTUP_LOG_BYTES) {
        fail("Cloudflare quick tunnel startup log is oversized");
        return;
      }
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
    const timer = setTimeout(
      () => fail("Cloudflare quick tunnel startup deadline exceeded"),
      STARTUP_TIMEOUT_MS,
    );
    input.signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", onError);
    child.once("exit", onExit);
  });
}
