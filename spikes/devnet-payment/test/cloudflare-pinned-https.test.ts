import { EventEmitter } from "node:events";
import type { request as httpsRequest, RequestOptions } from "node:https";
import { expect, it, vi } from "vitest";
import { requestPinnedCloudflareHttps } from "../src/cloudflare-pinned-fetch.js";

class FakeRequest extends EventEmitter {
  readonly end = vi.fn();
}

class FakeIncoming extends EventEmitter {
  readonly destroy = vi.fn();

  constructor(
    readonly statusCode: number | undefined,
    readonly rawHeaders: string[],
  ) {
    super();
  }
}

function openResponse(
  incoming: FakeIncoming,
  capture: (url: URL, options: RequestOptions) => void = () => undefined,
) {
  const request = new FakeRequest();
  const openHttps = vi.fn((url, options, listener) => {
    capture(url as URL, options as RequestOptions);
    queueMicrotask(() => listener(incoming));
    return request;
  }) as unknown as typeof httpsRequest;
  return { openHttps, request };
}

const input = Object.freeze({
  address: "104.16.0.1",
  family: 4 as const,
  signal: new AbortController().signal,
  url: new URL("https://human-live.trycloudflare.com/paid/weather"),
});

it("pins only socket lookup while preserving TLS hostname verification", async () => {
  const incoming = new FakeIncoming(402, ["PAYMENT-REQUIRED", "e30="]);
  let url!: URL;
  let options!: RequestOptions & { autoSelectFamily?: boolean };
  const { openHttps, request } = openResponse(incoming, (seen, candidate) => {
    url = seen;
    options = candidate;
  });

  const response = await requestPinnedCloudflareHttps(input, { openHttps });

  expect(url.href).toBe(input.url.href);
  expect(options).toMatchObject({
    agent: false,
    autoSelectFamily: false,
    family: 4,
    maxHeaderSize: 32_768,
    method: "GET",
    rejectUnauthorized: true,
    servername: input.url.hostname,
    signal: input.signal,
  });
  expect(options).not.toHaveProperty("headers");
  const lookup = options.lookup!;
  let exactAddress: unknown;
  lookup(input.url.hostname, { all: false }, (error, address) => {
    expect(error).toBeNull();
    exactAddress = address;
  });
  expect(exactAddress).toBe(input.address);
  lookup("other.trycloudflare.com", { all: false }, (error) => {
    expect(error).toBeInstanceOf(Error);
  });
  expect(response.status).toBe(402);
  expect(request.end).toHaveBeenCalledOnce();
  expect(incoming.destroy).toHaveBeenCalledOnce();
});

it.each([
  [302, ["Location", "https://example.com"]],
  [402, []],
  [402, ["PAYMENT-REQUIRED", "one", "payment-required", "two"]],
  [402, ["PAYMENT-REQUIRED", "x".repeat(16_385)]],
] as const)(
  "rejects status/header shape without fallback",
  async (status, raw) => {
    const incoming = new FakeIncoming(status, [...raw]);
    const { openHttps } = openResponse(incoming);

    await expect(
      requestPinnedCloudflareHttps(input, { openHttps }),
    ).rejects.toThrow(/Cloudflare HTTPS response failed/u);
    expect(openHttps).toHaveBeenCalledOnce();
    expect(incoming.destroy).toHaveBeenCalledOnce();
  },
);

it("fails closed on TLS transport error without fallback", async () => {
  const request = new FakeRequest();
  const openHttps = vi.fn(() => {
    queueMicrotask(() =>
      request.emit("error", new Error("private TLS detail")),
    );
    return request;
  }) as unknown as typeof httpsRequest;

  await expect(
    requestPinnedCloudflareHttps(input, { openHttps }),
  ).rejects.toThrow("Cloudflare HTTPS request failed");
  expect(openHttps).toHaveBeenCalledOnce();
});
