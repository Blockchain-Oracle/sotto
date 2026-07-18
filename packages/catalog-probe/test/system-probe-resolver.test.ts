import { CANCELLED, NODATA, NOTFOUND } from "node:dns/promises";
import { describe, expect, it, vi } from "vitest";
import { createSystemProbeAddressResolver } from "../src/system-probe-resolver.js";

type DnsErrorCode = typeof CANCELLED | typeof NODATA | typeof NOTFOUND | string;

function dnsError(code: DnsErrorCode): Error & { code: string } {
  return Object.assign(new Error(`private DNS error ${code}`), { code });
}

function resolver(input: {
  ipv4?: readonly string[] | Error;
  ipv6?: readonly string[] | Error;
}) {
  const answer = (value: readonly string[] | Error | undefined) =>
    value instanceof Error
      ? Promise.reject(value)
      : Promise.resolve([...(value ?? [])]);
  return {
    cancel: vi.fn(),
    resolve4: vi.fn(() => answer(input.ipv4)),
    resolve6: vi.fn(() => answer(input.ipv6)),
  };
}

describe("system probe DNS resolver", () => {
  it("combines A and AAAA answers in deterministic byte order", async () => {
    const first = resolver({
      ipv4: ["93.184.216.35", "93.184.216.34"],
      ipv6: [
        "2606:2800:220:1:248:1893:25c8:1947",
        "2606:2800:220:1:248:1893:25c8:1946",
      ],
    });
    const second = resolver({
      ipv4: ["93.184.216.34", "93.184.216.35"],
      ipv6: [
        "2606:2800:220:1:248:1893:25c8:1946",
        "2606:2800:220:1:248:1893:25c8:1947",
      ],
    });
    const request = {
      hostname: "provider.example",
      signal: new AbortController().signal,
    };

    const firstAnswers = await createSystemProbeAddressResolver(() => first)(
      request,
    );
    const secondAnswers = await createSystemProbeAddressResolver(() => second)(
      request,
    );

    expect(first.resolve4).toHaveBeenCalledWith("provider.example");
    expect(first.resolve6).toHaveBeenCalledWith("provider.example");
    expect(firstAnswers).toEqual(secondAnswers);
    expect(firstAnswers).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "93.184.216.35", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      { address: "2606:2800:220:1:248:1893:25c8:1947", family: 6 },
    ]);
  });

  it.each([
    ["missing A", NODATA, ["2606:2800:220:1:248:1893:25c8:1946"], 6],
    ["missing AAAA", NOTFOUND, ["93.184.216.34"], 4],
  ] as const)(
    "tolerates %s when the other family resolves",
    async (_name, code, addresses, family) => {
      const source = resolver({
        ipv4: family === 4 ? addresses : dnsError(code),
        ipv6: family === 6 ? addresses : dnsError(code),
      });
      const resolve = createSystemProbeAddressResolver(() => source);

      await expect(
        resolve({
          hostname: "provider.example",
          signal: new AbortController().signal,
        }),
      ).resolves.toEqual(addresses.map((address) => ({ address, family })));
    },
  );

  it("cancels both outstanding queries when aborted", async () => {
    let rejectIpv4!: (error: Error) => void;
    let rejectIpv6!: (error: Error) => void;
    const source = {
      cancel: vi.fn(() => {
        rejectIpv4(dnsError(CANCELLED));
        rejectIpv6(dnsError(CANCELLED));
      }),
      resolve4: vi.fn(
        () => new Promise<string[]>((_, reject) => (rejectIpv4 = reject)),
      ),
      resolve6: vi.fn(
        () => new Promise<string[]>((_, reject) => (rejectIpv6 = reject)),
      ),
    };
    const controller = new AbortController();
    const pending = createSystemProbeAddressResolver(() => source)({
      hostname: "provider.example",
      signal: controller.signal,
    });

    controller.abort("private caller reason");

    await expect(pending).rejects.toThrow("catalog probe DNS interrupted");
    expect(source.cancel).toHaveBeenCalledOnce();
  });

  it("normalizes non-absence resolver failures", async () => {
    const resolve = createSystemProbeAddressResolver(() =>
      resolver({ ipv4: dnsError("ESERVFAIL"), ipv6: ["2606:4700::1111"] }),
    );

    await expect(
      resolve({
        hostname: "provider.example",
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("catalog probe DNS failed");
  });
});
