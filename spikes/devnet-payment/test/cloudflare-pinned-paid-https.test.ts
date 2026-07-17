import { EventEmitter } from "node:events";
import type { request as httpsRequest, RequestOptions } from "node:https";
import { expect, it, vi } from "vitest";
import { encodeSettlementProof } from "../src/provider.js";
import { requestPinnedCloudflarePaidHttps } from "../src/cloudflare-pinned-paid-fetch.js";

class FakeRequest extends EventEmitter {
  readonly end = vi.fn();
}

class FakeIncoming extends EventEmitter {
  readonly destroy = vi.fn();

  constructor(
    readonly statusCode: number | undefined,
    readonly rawHeaders: string[],
    readonly chunks: Uint8Array[],
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
    queueMicrotask(() => {
      listener(incoming);
      for (const chunk of incoming.chunks) incoming.emit("data", chunk);
      incoming.emit("end");
    });
    return request;
  }) as unknown as typeof httpsRequest;
  return { openHttps, request };
}

const paymentSignature = encodeSettlementProof({
  attemptId: `sha256:${"a".repeat(64)}`,
  requestCommitment: `sha256:${"b".repeat(64)}`,
  updateId: `1220${"c".repeat(64)}`,
});

const input = Object.freeze({
  address: "104.16.0.1",
  family: 4 as const,
  paymentSignature,
  signal: new AbortController().signal,
  url: new URL("https://human-live.trycloudflare.com/paid/weather"),
});

it("pins TLS and returns one bounded authentic paid response", async () => {
  const body = new TextEncoder().encode('{"paid":true}');
  const incoming = new FakeIncoming(
    200,
    ["content-type", "application/json", "content-length", `${body.length}`],
    [body],
  );
  let url!: URL;
  let options!: RequestOptions & { autoSelectFamily?: boolean };
  const { openHttps, request } = openResponse(incoming, (seen, candidate) => {
    url = seen;
    options = candidate;
  });

  const response = await requestPinnedCloudflarePaidHttps(input, { openHttps });

  expect(url.href).toBe(input.url.href);
  expect(options).toMatchObject({
    agent: false,
    autoSelectFamily: false,
    family: 4,
    headers: { "PAYMENT-SIGNATURE": paymentSignature },
    maxHeaderSize: 32_768,
    method: "GET",
    rejectUnauthorized: true,
    servername: input.url.hostname,
    signal: input.signal,
  });
  expect(Object.keys(options.headers as object)).toEqual(["PAYMENT-SIGNATURE"]);
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
  expect(response.status).toBe(200);
  await expect(response.text()).resolves.toBe('{"paid":true}');
  expect(request.end).toHaveBeenCalledOnce();
  expect(incoming.destroy).not.toHaveBeenCalled();
});

it("rejects URL credentials before opening a paid TLS socket", async () => {
  const openHttps = vi.fn(() => {
    throw new Error("network must not open");
  }) as unknown as typeof httpsRequest;

  await expect(
    requestPinnedCloudflarePaidHttps(
      {
        ...input,
        url: new URL("https://user@human-live.trycloudflare.com/paid/weather"),
      },
      { openHttps },
    ),
  ).rejects.toThrow(/paid HTTPS input/iu);
  expect(openHttps).not.toHaveBeenCalled();
});

it.each([
  ["redirect", 302, ["location", "https://example.com"], []],
  [
    "too many headers",
    200,
    Array.from({ length: 129 }, (_, index) => [`x-${index}`, "v"]).flat(),
    [],
  ],
  ["oversized headers", 200, ["x-large", "x".repeat(32_769)], []],
  ["invalid declared body", 200, ["content-length", "01"], []],
  ["oversized declared body", 200, ["content-length", "2000001"], []],
  ["oversized streamed body", 200, [], [new Uint8Array(2_000_001)]],
  [
    "mismatched streamed body",
    200,
    ["content-length", "2"],
    [new Uint8Array(1)],
  ],
] as const)(
  "rejects %s without redirect or fallback",
  async (_label, status, rawHeaders, chunks) => {
    const incoming = new FakeIncoming(status, [...rawHeaders], [...chunks]);
    const { openHttps } = openResponse(incoming);

    await expect(
      requestPinnedCloudflarePaidHttps(input, { openHttps }),
    ).rejects.toThrow("Cloudflare paid HTTPS response failed");
    expect(openHttps).toHaveBeenCalledOnce();
    expect(incoming.destroy).toHaveBeenCalledOnce();
  },
);

it("fails closed on paid TLS transport error", async () => {
  const request = new FakeRequest();
  const openHttps = vi.fn(() => {
    queueMicrotask(() =>
      request.emit("error", new Error("private TLS transport detail")),
    );
    return request;
  }) as unknown as typeof httpsRequest;

  await expect(
    requestPinnedCloudflarePaidHttps(input, { openHttps }),
  ).rejects.toThrow("Cloudflare paid HTTPS request failed");
  expect(openHttps).toHaveBeenCalledOnce();
});
