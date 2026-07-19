import { afterEach, expect, it, vi } from "vitest";
import { CloudflareQuickTunnelRateLimitError } from "../src/cloudflare-quick-tunnel.js";
import { acquireResolvableCloudflareQuickTunnel } from "../src/cloudflare-quick-tunnel-resolution.js";

afterEach(() => vi.useRealTimers());

it("waits one bounded cooldown before retrying a rate-limited allocation", async () => {
  vi.useFakeTimers();
  const close = vi.fn(async () => undefined);
  const start = vi
    .fn()
    .mockRejectedValueOnce(new CloudflareQuickTunnelRateLimitError())
    .mockResolvedValueOnce({
      close,
      origin: "https://live.trycloudflare.com" as const,
    });
  const pending = acquireResolvableCloudflareQuickTunnel(
    { port: 8_791, signal: new AbortController().signal },
    start,
    async () => ["104.16.0.1"],
  );
  await vi.advanceTimersByTimeAsync(299_999);
  expect(start).toHaveBeenCalledOnce();

  await vi.advanceTimersByTimeAsync(1);

  await expect(pending).resolves.toMatchObject({
    address: "104.16.0.1",
  });
  expect(start).toHaveBeenCalledTimes(2);
  expect(close).not.toHaveBeenCalled();
});

it("does not retry a second rate limit", async () => {
  vi.useFakeTimers();
  const start = vi.fn(async () => {
    throw new CloudflareQuickTunnelRateLimitError();
  });
  const pending = acquireResolvableCloudflareQuickTunnel(
    { port: 8_791, signal: new AbortController().signal },
    start,
    async () => ["104.16.0.1"],
  );
  const rejection = expect(pending).rejects.toThrow(/rate limited/iu);

  await vi.advanceTimersByTimeAsync(300_000);

  await rejection;
  expect(start).toHaveBeenCalledTimes(2);
});

it("cancels during cooldown without starting another tunnel", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const start = vi.fn(async () => {
    throw new CloudflareQuickTunnelRateLimitError();
  });
  const pending = acquireResolvableCloudflareQuickTunnel(
    { port: 8_791, signal: controller.signal },
    start,
    async () => ["104.16.0.1"],
  );
  const rejection = expect(pending).rejects.toThrow(/cancelled/iu);
  await Promise.resolve();

  controller.abort();

  await rejection;
  expect(start).toHaveBeenCalledOnce();
});
