import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
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

afterEach(() => vi.useRealTimers());

describe("observeHttpChallenge", () => {
  it("requires URL authorization before making a bounded unpaid request", async () => {
    const fetchAuthorized = vi.fn(async (_url: URL, _init: RequestInit) => {
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
      fetchAuthorized,
      method: "POST",
      requestBody: new TextEncoder().encode('{"prompt":"private"}'),
      resourceUrl: "https://provider.example/resource",
      timeoutMs: 2_000,
    });

    expect(fetchAuthorized).toHaveBeenCalledWith(
      new URL("https://provider.example/resource"),
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
    const requestHeaders = fetchAuthorized.mock.calls[0]?.[1].headers;
    expect(new Headers(requestHeaders).has("PAYMENT-SIGNATURE")).toBe(false);
    expect(observation).toMatchObject({
      compatibility: {
        exactRequestBinding: "not-proven",
        resourceUrlBinding: "matched",
      },
      delivery: "pending",
      httpStatus: 402,
      settlement: "pending",
      paymentObservation: {
        challengeId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        httpStatus: 402,
      },
    });
    expect(observation.paymentObservation).not.toHaveProperty("challengeBytes");
  });

  it("rejects a non-402 response", async () => {
    await expect(
      observeHttpChallenge({
        fetchAuthorized: async () => new Response(null, { status: 200 }),
        method: "GET",
        resourceUrl: "https://provider.example/resource",
      }),
    ).rejects.toThrow("expected HTTP 402");
  });

  it("fails closed without an authorized fetch boundary", async () => {
    await expect(
      observeHttpChallenge({
        method: "GET",
        resourceUrl: "https://provider.example/resource",
      } as never),
    ).rejects.toThrow("authorized fetch");
  });

  it("requires the v2 PAYMENT-REQUIRED header", async () => {
    await expect(
      observeHttpChallenge({
        fetchAuthorized: async () =>
          new Response(null, {
            headers: { "X-PAYMENT-REQUIRED": paymentRequired },
            status: 402,
          }),
        method: "GET",
        resourceUrl: "https://provider.example/resource",
      }),
    ).rejects.toThrow("PAYMENT-REQUIRED header");
  });

  it("binds the immutable bytes actually sent when the caller mutates its body", async () => {
    const body = new TextEncoder().encode("original");
    let sent = new Uint8Array();
    const observation = await observeHttpChallenge({
      fetchAuthorized: async (_url, init) => {
        sent = Uint8Array.from(init.body as Uint8Array);
        body.fill(0x78);
        return new Response(null, {
          headers: { "PAYMENT-REQUIRED": paymentRequired },
          status: 402,
        });
      },
      method: "POST",
      requestBody: body,
      resourceUrl: "https://provider.example/resource",
    });
    expect(observation.bodySha256).toBe(
      createHash("sha256").update(sent).digest("hex"),
    );
  });

  it("uses the authenticated payment observation time for the challenge", async () => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:00.000Z") });
    const headers = new Headers({ "PAYMENT-REQUIRED": paymentRequired });
    const read = headers.get.bind(headers);
    let reads = 0;
    vi.spyOn(headers, "get").mockImplementation((name) => {
      reads += 1;
      if (reads === 2) vi.advanceTimersByTime(1);
      return read(name);
    });

    const observation = await observeHttpChallenge({
      fetchAuthorized: async () =>
        ({ body: null, headers, status: 402 }) as Response,
      method: "GET",
      resourceUrl: "https://provider.example/resource",
    });

    expect(observation.observedAt).toBe("2026-07-13T10:00:00.000Z");
    expect(observation.observedAt).toBe(
      observation.paymentObservation.observedAt,
    );
  });

  it("rejects an oversized body before fetch", async () => {
    const fetchAuthorized = vi.fn(
      async () => new Response(null, { status: 402 }),
    );
    await expect(
      observeHttpChallenge({
        fetchAuthorized,
        method: "POST",
        requestBody: new Uint8Array(1_048_577),
        resourceUrl: "https://provider.example/resource",
      }),
    ).rejects.toThrow("body exceeds");
    expect(fetchAuthorized).not.toHaveBeenCalled();
  });

  it("passes the caller cancellation signal into the authorized fetch", async () => {
    const controller = new AbortController();
    const fetchAuthorized = vi.fn(async (_url: URL, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      controller.abort("private caller reason");
      throw new DOMException("aborted", "AbortError");
    });

    const promise = observeHttpChallenge({
      fetchAuthorized,
      method: "GET",
      resourceUrl: "https://provider.example/resource",
      signal: controller.signal,
    });
    await expect(promise).rejects.toThrow("HTTP observation cancelled");
    await expect(promise).rejects.not.toThrow(/private caller reason/);
    expect(fetchAuthorized).toHaveBeenCalledOnce();
  });
});
