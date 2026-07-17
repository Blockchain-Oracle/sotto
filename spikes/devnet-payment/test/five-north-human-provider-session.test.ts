import type { HumanPaymentFetchRequest } from "@sotto/x402-canton";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startFiveNorthHumanProviderSession } from "../src/five-north-human-provider-session.js";

const FINGERPRINT = `1220${"a".repeat(64)}`;
const PAYER = `sotto-external-payer::${FINGERPRINT}`;
const PROVIDER = `sotto-provider::1220${"b".repeat(64)}`;
const DSO = `DSO::1220${"c".repeat(64)}`;
const SYNCHRONIZER = `global-domain::1220${"d".repeat(64)}`;

afterEach(() => vi.useRealTimers());

function request(
  url: string,
  headers: ReadonlyArray<readonly [string, string]> = [],
): HumanPaymentFetchRequest {
  return Object.freeze({
    headers,
    method: "GET",
    redirect: "error",
    signal: new AbortController().signal,
    url,
  });
}

describe("Five North read-only human provider session", () => {
  it("owns a fresh tunnel/provider and exposes only an unsigned 402 fetch", async () => {
    const events: string[] = [];
    const closeProvider = vi.fn(async () => {
      events.push("provider-close");
    });
    const closeTunnel = vi.fn(async () => {
      events.push("tunnel-close");
    });
    let handler!: (request: Request) => Promise<Response>;
    const startProvider = vi.fn(
      async (
        input: Readonly<{
          handler: (request: Request) => Promise<Response>;
          port: number;
          resourceUrl: string;
        }>,
      ) => {
        events.push("provider-start");
        handler = input.handler;
        return {
          close: closeProvider,
          localUrl: "http://127.0.0.1:8791/paid/weather",
        };
      },
    );
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      events.push("fetch");
      const requestInit: RequestInit = {
        ...(init?.headers === undefined ? {} : { headers: init.headers }),
        ...(init?.method === undefined ? {} : { method: init.method }),
      };
      return await handler(new Request(url, requestInit));
    });
    const session = await startFiveNorthHumanProviderSession(
      {
        dsoParty: DSO,
        payerParty: PAYER,
        port: 8_791,
        providerParty: PROVIDER,
        signal: new AbortController().signal,
        synchronizerId: SYNCHRONIZER,
      },
      {
        fetcher,
        resolveOrigin: async () => undefined,
        startProvider,
        startTunnel: async () => {
          events.push("tunnel-start");
          return {
            close: closeTunnel,
            origin: "https://human-live.trycloudflare.com" as const,
          };
        },
      },
    );

    expect(events.slice(0, 3)).toEqual([
      "tunnel-start",
      "provider-start",
      "fetch",
    ]);
    expect(session.resourceUrl).toBe(
      "https://human-live.trycloudflare.com/paid/weather",
    );
    await expect(
      session.fetchAuthorized(request(session.resourceUrl)),
    ).resolves.toMatchObject({ status: 402 });
    await expect(
      session.fetchAuthorized(
        request(session.resourceUrl, [["PAYMENT-SIGNATURE", "forbidden"]]),
      ),
    ).rejects.toThrow(/signature|headers/iu);
    await session.close();
    expect(events.slice(-2)).toEqual(["tunnel-close", "provider-close"]);
  });

  it("closes the tunnel if the local provider cannot start", async () => {
    const closeTunnel = vi.fn(async () => undefined);
    await expect(
      startFiveNorthHumanProviderSession(
        {
          dsoParty: DSO,
          payerParty: PAYER,
          port: 8_791,
          providerParty: PROVIDER,
          signal: new AbortController().signal,
          synchronizerId: SYNCHRONIZER,
        },
        {
          fetcher: vi.fn(),
          resolveOrigin: async () => undefined,
          startProvider: async () => {
            throw new Error("private bind detail");
          },
          startTunnel: async () => ({
            close: closeTunnel,
            origin: "https://human-live.trycloudflare.com" as const,
          }),
        },
      ),
    ).rejects.toThrow();
    expect(closeTunnel).toHaveBeenCalledOnce();
  });

  it("recycles a quick tunnel whose assigned hostname does not resolve", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const firstClose = vi.fn(async () => {
      events.push("first-tunnel-close");
    });
    const liveClose = vi.fn(async () => {
      events.push("live-tunnel-close");
    });
    const startTunnel = vi
      .fn()
      .mockResolvedValueOnce({
        close: firstClose,
        origin: "https://missing-name.trycloudflare.com" as const,
      })
      .mockResolvedValueOnce({
        close: liveClose,
        origin: "https://live-name.trycloudflare.com" as const,
      });
    let handler!: (request: Request) => Promise<Response>;
    const pending = startFiveNorthHumanProviderSession(
      {
        dsoParty: DSO,
        payerParty: PAYER,
        port: 8_791,
        providerParty: PROVIDER,
        signal: new AbortController().signal,
        synchronizerId: SYNCHRONIZER,
      },
      {
        fetcher: async (url, init) =>
          handler(
            new Request(url, {
              ...(init?.method === undefined ? {} : { method: init.method }),
            }),
          ),
        resolveOrigin: async (hostname) => {
          events.push(`resolve:${hostname}`);
          if (hostname.startsWith("missing-")) throw new Error("ENOTFOUND");
        },
        startProvider: async (input) => {
          handler = input.handler;
          return {
            close: async () => undefined,
            localUrl: "http://127.0.0.1:8791/paid/weather",
          };
        },
        startTunnel,
      },
    );

    await vi.advanceTimersByTimeAsync(30_001);
    const session = await pending;

    expect(session.resourceUrl).toBe(
      "https://live-name.trycloudflare.com/paid/weather",
    );
    expect(events).toContain("resolve:missing-name.trycloudflare.com");
    expect(events).toContain("first-tunnel-close");
    expect(events.at(-1)).toBe("resolve:live-name.trycloudflare.com");
    expect(startTunnel).toHaveBeenCalledTimes(2);
    await session.close();
    expect(liveClose).toHaveBeenCalledOnce();
  });

  it("stops the public tunnel before bounding a hung provider close", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const closeProvider = vi.fn(() => {
      events.push("provider-close");
      return new Promise<void>(() => undefined);
    });
    const closeTunnel = vi.fn(async () => {
      events.push("tunnel-close");
    });
    const session = await startFiveNorthHumanProviderSession(
      {
        dsoParty: DSO,
        payerParty: PAYER,
        port: 8_791,
        providerParty: PROVIDER,
        signal: new AbortController().signal,
        synchronizerId: SYNCHRONIZER,
      },
      {
        fetcher: async () =>
          new Response(null, {
            headers: { "PAYMENT-REQUIRED": "challenge" },
            status: 402,
          }),
        resolveOrigin: async () => undefined,
        startProvider: async () => ({
          close: closeProvider,
          localUrl: "http://127.0.0.1:8791/paid/weather",
        }),
        startTunnel: async () => ({
          close: closeTunnel,
          origin: "https://human-live.trycloudflare.com" as const,
        }),
      },
    );
    const closing = session.close();
    await vi.advanceTimersByTimeAsync(5_001);

    await expect(closing).resolves.toBeUndefined();
    expect(events).toEqual(["tunnel-close", "provider-close"]);
  });
});
