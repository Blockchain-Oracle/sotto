import { afterEach, expect, it, vi } from "vitest";
import {
  acquireResolvableCloudflareQuickTunnel,
  readPublicCloudflareIpv4,
  resolveCloudflareIpv4,
  selectPublicCloudflareIpv4Address,
} from "../src/cloudflare-quick-tunnel-resolution.js";

afterEach(() => vi.useRealTimers());

function tunnel(
  name: string,
  events: string[],
): Readonly<{
  close: () => Promise<void>;
  origin: `https://${string}.trycloudflare.com`;
}> {
  return {
    close: async () => {
      events.push(`close:${name}`);
    },
    origin: `https://${name}.trycloudflare.com`,
  };
}

it("closes each unresolved allocation before starting the next", async () => {
  vi.useFakeTimers();
  const events: string[] = [];
  const start = vi.fn(async () => {
    const name = start.mock.calls.length === 1 ? "missing" : "live";
    events.push(`start:${name}`);
    return tunnel(name, events);
  });
  const pending = acquireResolvableCloudflareQuickTunnel(
    { port: 8_791, signal: new AbortController().signal },
    start,
    async (hostname) => {
      if (hostname.startsWith("missing.")) throw new Error("ENOTFOUND");
      return ["104.16.0.1"];
    },
  );

  await vi.advanceTimersByTimeAsync(30_001);
  const result = await pending;

  expect(result.origin).toBe("https://live.trycloudflare.com");
  expect(result.address).toBe("104.16.0.1");
  expect(events).toEqual(["start:missing", "close:missing", "start:live"]);
});

it("recycles a tunnel whose DNS answer is not a public IPv4 address", async () => {
  vi.useFakeTimers();
  const events: string[] = [];
  const start = vi.fn(async () => {
    const name = start.mock.calls.length === 1 ? "private" : "live";
    events.push(`start:${name}`);
    return tunnel(name, events);
  });
  const pending = acquireResolvableCloudflareQuickTunnel(
    { port: 8_791, signal: new AbortController().signal },
    start,
    async (hostname) =>
      hostname.startsWith("private.") ? ["127.0.0.1"] : ["104.16.0.1"],
  );

  await vi.advanceTimersByTimeAsync(30_001);
  const result = await pending;

  expect(result.address).toBe("104.16.0.1");
  expect(events).toEqual(["start:private", "close:private", "start:live"]);
});

it.each([
  "0.0.0.1",
  "10.0.0.1",
  "100.64.0.1",
  "127.0.0.1",
  "169.254.1.1",
  "172.16.0.1",
  "192.0.0.1",
  "192.0.2.1",
  "192.88.99.1",
  "192.168.0.1",
  "198.18.0.1",
  "198.51.100.1",
  "203.0.113.1",
  "224.0.0.1",
  "2001:db8::1",
  "not-an-address",
])("rejects non-public DNS address %s", (address) => {
  expect(() => readPublicCloudflareIpv4(address)).toThrow();
});

it.each([
  [],
  ["104.16.0.1", "104.16.0.1"],
  ["104.16.0.1", "127.0.0.1"],
  Array.from({ length: 9 }, (_, index) => `104.16.0.${index + 1}`),
])("rejects malformed DNS answer sets", (addresses) => {
  expect(selectPublicCloudflareIpv4Address(addresses)).toBeUndefined();
});

it("stops after exactly three unresolved allocations", async () => {
  vi.useFakeTimers();
  const events: string[] = [];
  const start = vi.fn(async () => {
    const name = `missing-${start.mock.calls.length}`;
    events.push(`start:${name}`);
    return tunnel(name, events);
  });
  const pending = acquireResolvableCloudflareQuickTunnel(
    { port: 8_791, signal: new AbortController().signal },
    start,
    async () => {
      throw new Error("ENOTFOUND");
    },
  );
  const rejection = expect(pending).rejects.toThrow(/DNS/iu);

  await vi.advanceTimersByTimeAsync(90_100);
  await rejection;

  expect(start).toHaveBeenCalledTimes(3);
  expect(events.filter((event) => event.startsWith("close:"))).toHaveLength(3);
});

it("closes the current tunnel when a hanging lookup is cancelled", async () => {
  const events: string[] = [];
  const controller = new AbortController();
  let started!: () => void;
  let resolverSignal!: AbortSignal;
  const lookupStarted = new Promise<void>((resolve) => (started = resolve));
  const pending = acquireResolvableCloudflareQuickTunnel(
    { port: 8_791, signal: controller.signal },
    async () => tunnel("waiting", events),
    async (_hostname, signal) => {
      resolverSignal = signal;
      started();
      return new Promise<never>(() => undefined);
    },
  );
  const rejection = expect(pending).rejects.toThrow(/cancelled/iu);
  await lookupStarted;

  controller.abort();

  await rejection;
  expect(resolverSignal.aborted).toBe(true);
  expect(events).toEqual(["close:waiting"]);
});

it("rejects an already-aborted default resolver before DNS work", async () => {
  const controller = new AbortController();
  controller.abort();

  await expect(
    resolveCloudflareIpv4("unused.trycloudflare.com", controller.signal),
  ).rejects.toThrow(/cancelled/iu);
});

it("aborts a hung resolver at the attempt deadline before retry", async () => {
  vi.useFakeTimers();
  const events: string[] = [];
  let firstSignal!: AbortSignal;
  let firstStarted!: () => void;
  const firstLookup = new Promise<void>((resolve) => (firstStarted = resolve));
  const resolveOrigin = vi.fn(async (_hostname, signal: AbortSignal) => {
    if (resolveOrigin.mock.calls.length === 1) {
      firstSignal = signal;
      firstStarted();
      return await new Promise<never>(() => undefined);
    }
    return ["104.16.0.1"];
  });
  const pending = acquireResolvableCloudflareQuickTunnel(
    { port: 8_791, signal: new AbortController().signal },
    async () => tunnel("retry", events),
    resolveOrigin,
  );
  await firstLookup;

  await vi.advanceTimersByTimeAsync(3_000);
  expect(firstSignal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(1_000);

  await expect(pending).resolves.toMatchObject({ address: "104.16.0.1" });
  expect(resolveOrigin).toHaveBeenCalledTimes(2);
});
