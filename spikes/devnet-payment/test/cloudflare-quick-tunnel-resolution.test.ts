import { afterEach, expect, it, vi } from "vitest";
import { acquireResolvableCloudflareQuickTunnel } from "../src/cloudflare-quick-tunnel-resolution.js";

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
    },
  );

  await vi.advanceTimersByTimeAsync(30_001);
  const result = await pending;

  expect(result.origin).toBe("https://live.trycloudflare.com");
  expect(events).toEqual(["start:missing", "close:missing", "start:live"]);
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
  const lookupStarted = new Promise<void>((resolve) => (started = resolve));
  const pending = acquireResolvableCloudflareQuickTunnel(
    { port: 8_791, signal: controller.signal },
    async () => tunnel("waiting", events),
    async () => {
      started();
      return new Promise<never>(() => undefined);
    },
  );
  const rejection = expect(pending).rejects.toThrow(/cancelled/iu);
  await lookupStarted;

  controller.abort();

  await rejection;
  expect(events).toEqual(["close:waiting"]);
});
