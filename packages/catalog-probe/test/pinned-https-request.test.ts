import { EventEmitter } from "node:events";
import type { request as requestHttps } from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestPinnedHttpsProbe,
  resolvePublicHttpsTarget,
} from "../src/index.js";

const URL = "https://provider.example/v1/weather";
const ADDRESS = "93.184.216.34";
const paymentRequired = Buffer.from(
  JSON.stringify({ x402Version: 2, resource: { url: URL }, accepts: [] }),
).toString("base64");

type FakeResponseOptions = Readonly<{
  address?: string;
  hang?: boolean;
  rawHeaders?: string[];
  status?: number;
}>;

function fakeHttps(options: FakeResponseOptions = {}) {
  const incoming = Object.assign(new EventEmitter(), {
    destroy: vi.fn(),
    rawHeaders: options.rawHeaders ?? ["PAYMENT-REQUIRED", paymentRequired],
    socket: { remoteAddress: options.address ?? ADDRESS },
    statusCode: options.status ?? 402,
  });
  const request = Object.assign(new EventEmitter(), {
    destroy: vi.fn(),
    end: vi.fn(),
    write: vi.fn(),
  });
  const open = vi.fn((_url, _requestOptions, onResponse) => {
    request.end.mockImplementation(() => {
      if (options.hang !== true) onResponse(incoming);
    });
    return request;
  });
  return {
    incoming,
    open: open as unknown as typeof requestHttps,
    rawOpen: open,
    request,
  };
}

async function target() {
  return await resolvePublicHttpsTarget(
    URL,
    async () => [{ address: ADDRESS, family: 4 }],
    new AbortController().signal,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-07-18T10:00:00.000Z") });
});

afterEach(() => vi.useRealTimers());

describe("pinned HTTPS probe transport", () => {
  it("pins DNS and original-host TLS without buffering the response", async () => {
    const fake = fakeHttps();
    const signal = new AbortController().signal;
    const response = await requestPinnedHttpsProbe(
      await target(),
      { method: "GET", signal },
      { openHttps: fake.open },
    );

    expect(response.status).toBe(402);
    expect(response.headers.get("PAYMENT-REQUIRED")).toBe(paymentRequired);
    expect(fake.incoming.destroy).toHaveBeenCalledOnce();
    expect(fake.incoming.listenerCount("data")).toBe(0);
    expect(fake.rawOpen).toHaveBeenCalledOnce();
    const [url, options] = fake.rawOpen.mock.calls[0]!;
    expect(url.toString()).toBe(URL);
    expect(options).toMatchObject({
      agent: false,
      autoSelectFamily: false,
      family: 4,
      maxHeaderSize: 32_768,
      method: "GET",
      rejectUnauthorized: true,
      servername: "provider.example",
      signal,
    });
    expect(JSON.stringify(options.headers)).not.toMatch(
      /authorization|cookie|payment|proxy/iu,
    );
    const lookup = options.lookup as unknown as (
      hostname: string,
      options: { all?: boolean },
      callback: (error: Error | null, address: string, family: number) => void,
    ) => void;
    const callback = vi.fn();
    lookup("provider.example", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, ADDRESS, 4);
  });

  it("rejects a forged target before opening a socket", async () => {
    const fake = fakeHttps();
    await expect(
      requestPinnedHttpsProbe(
        { ...(await target()) },
        { method: "GET", signal: new AbortController().signal },
        { openHttps: fake.open },
      ),
    ).rejects.toThrow(/not authenticated/iu);
    expect(fake.rawOpen).not.toHaveBeenCalled();
  });

  it.each([
    ["redirect", { status: 302 }],
    ["remote address mismatch", { address: "93.184.216.35" }],
    [
      "duplicate payment carrier",
      {
        rawHeaders: [
          "PAYMENT-REQUIRED",
          paymentRequired,
          "payment-required",
          paymentRequired,
        ],
      },
    ],
    [
      "too many headers",
      { rawHeaders: Array.from({ length: 258 }, () => "x") },
    ],
    ["oversized headers", { rawHeaders: ["x-large", "x".repeat(32_769)] }],
  ])("rejects %s", async (_name, options) => {
    const fake = fakeHttps(options);
    await expect(
      requestPinnedHttpsProbe(
        await target(),
        { method: "GET", signal: new AbortController().signal },
        { openHttps: fake.open },
      ),
    ).rejects.toThrow(/HTTPS probe/iu);
    expect(fake.incoming.destroy).toHaveBeenCalledOnce();
  });

  it("interrupts a hung request with a redacted error", async () => {
    vi.useRealTimers();
    const fake = fakeHttps({ hang: true });
    const controller = new AbortController();
    const pending = requestPinnedHttpsProbe(
      await target(),
      { method: "GET", signal: controller.signal },
      { openHttps: fake.open },
    );
    controller.abort("private caller reason");

    await expect(pending).rejects.toThrow("catalog HTTPS probe interrupted");
    expect(fake.request.destroy).toHaveBeenCalledOnce();
  });
});
