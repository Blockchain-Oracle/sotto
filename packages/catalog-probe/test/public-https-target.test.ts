import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolvePublicHttpsTarget,
  type ProbeAddressResolver,
} from "../src/index.js";

const URL = "https://provider.example/v1/weather";

function resolver(
  answers: ReadonlyArray<Readonly<{ address: string; family: 4 | 6 }>>,
): ProbeAddressResolver {
  return vi.fn(async () => answers);
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-07-18T10:00:00.000Z") });
});

afterEach(() => vi.useRealTimers());

describe("public HTTPS probe target", () => {
  it("authenticates a fresh public dual-stack resolution", async () => {
    const resolve = resolver([
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      { address: "93.184.216.34", family: 4 },
    ]);
    const signal = new AbortController().signal;

    const target = await resolvePublicHttpsTarget(URL, resolve, signal);

    expect(resolve).toHaveBeenCalledWith({
      hostname: "provider.example",
      signal,
    });
    expect(target).toEqual({
      hostname: "provider.example",
      resolvedAt: "2026-07-18T10:00:00.000Z",
      url: URL,
    });
    expect(Object.isFrozen(target)).toBe(true);
  });

  it.each([
    "http://provider.example/v1/weather",
    "https://user:password@provider.example/v1/weather",
    "https://provider.example/v1/weather#private",
    "https://127.0.0.1/v1/weather",
    "https://[::1]/v1/weather",
  ])("rejects an unsafe URL %s before resolution", async (url) => {
    const resolve = resolver([{ address: "93.184.216.34", family: 4 }]);
    await expect(
      resolvePublicHttpsTarget(url, resolve, new AbortController().signal),
    ).rejects.toThrow(/probe target/iu);
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each([
    ["unspecified IPv4", "0.0.0.1", 4],
    ["private IPv4", "10.1.2.3", 4],
    ["carrier NAT IPv4", "100.64.0.1", 4],
    ["loopback IPv4", "127.0.0.1", 4],
    ["link-local IPv4", "169.254.1.1", 4],
    ["private IPv4 172", "172.16.1.1", 4],
    ["private IPv4 192", "192.168.1.1", 4],
    ["benchmark IPv4", "198.18.0.1", 4],
    ["documentation IPv4", "203.0.113.5", 4],
    ["multicast IPv4", "224.0.0.1", 4],
    ["unspecified IPv6", "::", 6],
    ["loopback IPv6", "::1", 6],
    ["private IPv6", "fc00::1", 6],
    ["link-local IPv6", "fe80::1", 6],
    ["multicast IPv6", "ff02::1", 6],
    ["documentation IPv6", "2001:db8::1", 6],
    ["mapped private IPv6", "::ffff:10.1.2.3", 6],
  ])("rejects %s", async (_name, address, family) => {
    await expect(
      resolvePublicHttpsTarget(
        URL,
        resolver([{ address, family: family as 4 | 6 }]),
        new AbortController().signal,
      ),
    ).rejects.toThrow(/public address/iu);
  });

  it("rejects a mixed public and private answer set", async () => {
    await expect(
      resolvePublicHttpsTarget(
        URL,
        resolver([
          { address: "93.184.216.34", family: 4 },
          { address: "10.0.0.1", family: 4 },
        ]),
        new AbortController().signal,
      ),
    ).rejects.toThrow(/public address/iu);
  });

  it.each([
    ["empty", []],
    [
      "duplicate",
      [
        { address: "93.184.216.34", family: 4 },
        { address: "93.184.216.34", family: 4 },
      ],
    ],
    [
      "excessive",
      Array.from({ length: 17 }, (_, index) => ({
        address: `8.8.8.${index + 1}`,
        family: 4,
      })),
    ],
  ])("rejects a(n) %s answer set", async (_name, answers) => {
    await expect(
      resolvePublicHttpsTarget(
        URL,
        resolver(answers as ReadonlyArray<{ address: string; family: 4 | 6 }>),
        new AbortController().signal,
      ),
    ).rejects.toThrow(/DNS answer/iu);
  });

  it("interrupts a resolver that ignores cancellation", async () => {
    vi.useRealTimers();
    const controller = new AbortController();
    const pending = resolvePublicHttpsTarget(
      URL,
      async () => new Promise<never>(() => undefined),
      controller.signal,
    );
    controller.abort("private caller reason");

    await expect(pending).rejects.toThrow("catalog probe DNS interrupted");
  });
});
