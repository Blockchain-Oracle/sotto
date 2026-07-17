import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import type { CloudflareQuickTunnel } from "./cloudflare-quick-tunnel.js";

const MAXIMUM_TUNNEL_ALLOCATIONS = 3;
const MAXIMUM_DNS_ADDRESSES = 8;
const RESOLUTION_ATTEMPT_TIMEOUT_MS = 3_000;
const RESOLUTION_RETRY_MS = 1_000;
const RESOLUTION_WINDOW_MS = 30_000;

export type CloudflareTunnelOriginResolver = (
  hostname: string,
  signal: AbortSignal,
) => Promise<readonly string[]>;

export type ResolvedCloudflareQuickTunnel = CloudflareQuickTunnel &
  Readonly<{ address: string; family: 4 }>;

type TunnelStarter = (input: {
  port: number;
  signal: AbortSignal;
}) => Promise<CloudflareQuickTunnel>;

function active(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("Cloudflare tunnel resolution cancelled");
}

export function readPublicCloudflareIpv4(value: unknown): string {
  if (typeof value !== "string" || isIP(value) !== 4) {
    throw new Error("Cloudflare tunnel address is not IPv4");
  }
  const [first, second, third] = value.split(".").map(Number);
  const reserved =
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first! >= 224 ||
    (first === 100 && second! >= 64 && second! <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second! >= 16 && second! <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113);
  if (reserved) throw new Error("Cloudflare tunnel address is not public");
  return value;
}

export function selectPublicCloudflareIpv4Address(
  value: unknown,
): string | undefined {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAXIMUM_DNS_ADDRESSES ||
    Object.keys(value).length !== value.length
  ) {
    return undefined;
  }
  try {
    const addresses = value.map(readPublicCloudflareIpv4);
    if (new Set(addresses).size !== addresses.length) return undefined;
    return addresses.sort()[0];
  } catch {
    return undefined;
  }
}

export async function resolveCloudflareIpv4(
  hostname: string,
  signal: AbortSignal,
): Promise<readonly string[]> {
  active(signal);
  const resolver = new Resolver({ timeout: 2_000, tries: 1 });
  resolver.setServers(["1.1.1.1", "1.0.0.1"]);
  const cancel = () => resolver.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    return await resolver.resolve4(hostname);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
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
): Promise<string | undefined> {
  active(signal);
  return await new Promise<string | undefined>((resolve) => {
    let settled = false;
    const controller = new AbortController();
    const finish = (value: string | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      controller.abort();
      resolve(value);
    };
    const onAbort = () => finish(undefined);
    const timer = setTimeout(
      () => finish(undefined),
      RESOLUTION_ATTEMPT_TIMEOUT_MS,
    );
    signal.addEventListener("abort", onAbort, { once: true });
    void Promise.resolve()
      .then(() => resolveOrigin(hostname, controller.signal))
      .then(
        (addresses) => finish(selectPublicCloudflareIpv4Address(addresses)),
        () => finish(undefined),
      );
  });
}

async function waitForResolution(
  tunnel: CloudflareQuickTunnel,
  signal: AbortSignal,
  resolveOrigin: CloudflareTunnelOriginResolver,
): Promise<string | undefined> {
  const hostname = new URL(tunnel.origin).hostname;
  const deadline = Date.now() + RESOLUTION_WINDOW_MS;
  while (Date.now() < deadline) {
    const address = await attemptResolution(resolveOrigin, hostname, signal);
    if (address !== undefined) return address;
    active(signal);
    await delay(signal);
  }
  return undefined;
}

export async function acquireResolvableCloudflareQuickTunnel(
  input: Readonly<{ port: number; signal: AbortSignal }>,
  startTunnel: TunnelStarter,
  resolveOrigin: CloudflareTunnelOriginResolver = resolveCloudflareIpv4,
): Promise<ResolvedCloudflareQuickTunnel> {
  for (let attempt = 0; attempt < MAXIMUM_TUNNEL_ALLOCATIONS; attempt += 1) {
    active(input.signal);
    const tunnel = await startTunnel(input);
    let retained = false;
    try {
      const address = await waitForResolution(
        tunnel,
        input.signal,
        resolveOrigin,
      );
      if (address !== undefined) {
        retained = true;
        return Object.freeze({ ...tunnel, address, family: 4 as const });
      }
    } finally {
      if (!retained) await tunnel.close();
    }
    active(input.signal);
  }
  throw new Error("Cloudflare quick tunnel DNS is unavailable");
}
