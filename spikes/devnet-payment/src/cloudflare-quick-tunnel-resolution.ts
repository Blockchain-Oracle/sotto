import { lookup } from "node:dns/promises";
import type { CloudflareQuickTunnel } from "./cloudflare-quick-tunnel.js";

const MAXIMUM_TUNNEL_ALLOCATIONS = 3;
const RESOLUTION_ATTEMPT_TIMEOUT_MS = 3_000;
const RESOLUTION_RETRY_MS = 1_000;
const RESOLUTION_WINDOW_MS = 30_000;

export type CloudflareTunnelOriginResolver = (
  hostname: string,
) => Promise<unknown>;

type TunnelStarter = (input: {
  port: number;
  signal: AbortSignal;
}) => Promise<CloudflareQuickTunnel>;

function active(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("Cloudflare tunnel resolution cancelled");
}

function delay(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Cloudflare tunnel resolution cancelled"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, RESOLUTION_RETRY_MS);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function attemptResolution(
  resolveOrigin: CloudflareTunnelOriginResolver,
  hostname: string,
  signal: AbortSignal,
): Promise<boolean> {
  active(signal);
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => finish(false);
    const timer = setTimeout(
      () => finish(false),
      RESOLUTION_ATTEMPT_TIMEOUT_MS,
    );
    signal.addEventListener("abort", onAbort, { once: true });
    void Promise.resolve()
      .then(() => resolveOrigin(hostname))
      .then(
        () => finish(true),
        () => finish(false),
      );
  });
}

async function waitForResolution(
  tunnel: CloudflareQuickTunnel,
  signal: AbortSignal,
  resolveOrigin: CloudflareTunnelOriginResolver,
): Promise<boolean> {
  const hostname = new URL(tunnel.origin).hostname;
  const deadline = Date.now() + RESOLUTION_WINDOW_MS;
  while (Date.now() < deadline) {
    if (await attemptResolution(resolveOrigin, hostname, signal)) return true;
    active(signal);
    await delay(signal);
  }
  return false;
}

export async function acquireResolvableCloudflareQuickTunnel(
  input: Readonly<{ port: number; signal: AbortSignal }>,
  startTunnel: TunnelStarter,
  resolveOrigin: CloudflareTunnelOriginResolver = (hostname) =>
    lookup(hostname),
): Promise<CloudflareQuickTunnel> {
  for (let attempt = 0; attempt < MAXIMUM_TUNNEL_ALLOCATIONS; attempt += 1) {
    active(input.signal);
    const tunnel = await startTunnel(input);
    let retained = false;
    try {
      if (await waitForResolution(tunnel, input.signal, resolveOrigin)) {
        retained = true;
        return tunnel;
      }
    } finally {
      if (!retained) await tunnel.close();
    }
    active(input.signal);
  }
  throw new Error("Cloudflare quick tunnel DNS is unavailable");
}
