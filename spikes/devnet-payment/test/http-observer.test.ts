import { describe, expect, it, vi } from "vitest";
import { observeHttpChallenge } from "../src/http-observer.js";

const requirement = {
  accepts: [
    {
      amount: "12500000000",
      asset: "CC",
      extra: {
        assetTransferMethod: "transfer-factory",
        executeBeforeSeconds: 60,
        feePayer: "facilitator::1220fee",
        instrumentId: { admin: "DSO::1220dso", id: "Amulet" },
        synchronizerId: "global-domain::1220sync",
      },
      maxTimeoutSeconds: 60,
      network: "canton:devnet",
      payTo: "provider::1220abc",
      scheme: "exact",
    },
  ],
  resource: { url: "https://provider.example/resource" },
  x402Version: 2,
};
const paymentRequired = Buffer.from(JSON.stringify(requirement)).toString(
  "base64",
);

describe("observeHttpChallenge", () => {
  it("requires URL authorization before making a bounded unpaid request", async () => {
    const authorizeUrl = vi.fn(async () => undefined);
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => {
      void _url;
      void _init;
      return Promise.resolve(
        new Response(null, {
          headers: { "PAYMENT-REQUIRED": paymentRequired },
          status: 402,
        }),
      );
    });

    const observation = await observeHttpChallenge({
      authorizeUrl,
      fetcher,
      method: "POST",
      now: new Date("2026-07-12T15:59:00.000Z"),
      requestBody: new TextEncoder().encode('{"prompt":"private"}'),
      resourceUrl: "https://provider.example/resource",
      timeoutMs: 2_000,
    });

    expect(authorizeUrl).toHaveBeenCalledWith(
      new URL("https://provider.example/resource"),
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://provider.example/resource",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
    const requestHeaders = fetcher.mock.calls[0]?.[1].headers;
    expect(new Headers(requestHeaders).has("PAYMENT-SIGNATURE")).toBe(false);
    expect(observation).toMatchObject({
      compatibility: {
        exactRequestBinding: "not-proven",
        resourceUrlBinding: "matched",
      },
      delivery: "pending",
      httpStatus: 402,
      settlement: "pending",
    });
  });

  it("rejects a non-402 response", async () => {
    await expect(
      observeHttpChallenge({
        authorizeUrl: async () => undefined,
        fetcher: async () => new Response(null, { status: 200 }),
        method: "GET",
        resourceUrl: "https://provider.example/resource",
      }),
    ).rejects.toThrow("expected HTTP 402");
  });

  it("fails closed without URL authorization", async () => {
    await expect(
      observeHttpChallenge({
        fetcher: async () => new Response(null, { status: 402 }),
        method: "GET",
        resourceUrl: "https://provider.example/resource",
      }),
    ).rejects.toThrow("URL authority");
  });

  it("requires the v2 PAYMENT-REQUIRED header", async () => {
    await expect(
      observeHttpChallenge({
        authorizeUrl: async () => undefined,
        fetcher: async () =>
          new Response(null, {
            headers: { "X-PAYMENT-REQUIRED": paymentRequired },
            status: 402,
          }),
        method: "GET",
        resourceUrl: "https://provider.example/resource",
      }),
    ).rejects.toThrow("PAYMENT-REQUIRED header");
  });
});
