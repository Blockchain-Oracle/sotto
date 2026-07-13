import { describe, expect, it, vi } from "vitest";
import {
  createFiveNorthPrepareTransport,
  type FiveNorthPrepareTransport,
} from "../src/five-north-prepare-transport.js";
import type { SpikeConfig } from "../src/config.js";

const network: SpikeConfig["network"] = {
  audience: "validator-devnet-m2m",
  clientId: "validator-devnet-m2m",
  clientSecret: "test-secret",
  issuerUrl:
    "https://auth.sandbox.fivenorth.io/application/o/validator-devnet-m2m",
  ledgerUrl: "https://ledger-api.validator.devnet.sandbox.fivenorth.io",
  scope: "daml_ledger_api",
  tokenUrl: "https://auth.sandbox.fivenorth.io/application/o/token/",
  validatorUrl:
    "https://wallet.validator.devnet.sandbox.fivenorth.io/api/validator",
};
const PAYER = "sotto-prepare-payer::1220payer";

function tokenResponse(): Response {
  return Response.json({
    access_token: "test-access-token",
    expires_in: 28_800,
  });
}

function createTransport(
  fetcher: (url: string, init?: RequestInit) => Promise<Response>,
  signal = new AbortController().signal,
) {
  return createFiveNorthPrepareTransport(network, PAYER, { fetcher, signal });
}

describe("Five North prepare-only transport", () => {
  it("exposes only bounded read and prepare operations", () => {
    const transport = createTransport(vi.fn(async () => tokenResponse()));

    expect(Object.keys(transport).sort()).toEqual([
      "readCapabilityContracts",
      "readHoldingContracts",
      "readLedgerEnd",
      "readPrepare",
      "readRegistry",
    ] satisfies Array<keyof FiveNorthPrepareTransport>);
    expect(transport).not.toHaveProperty("execute");
    expect(transport).not.toHaveProperty("sign");
    expect(transport).not.toHaveProperty("submitSettlement");
  });

  it("uses exact authenticated endpoints and caches the OIDC token", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === network.tokenUrl) return tokenResponse();
      if (url.endsWith("/v2/state/ledger-end")) {
        return Response.json({ offset: 42 });
      }
      if (url.endsWith("/v2/state/active-contracts")) {
        return Response.json([]);
      }
      if (url.endsWith("/registry/transfer-instruction/v1/transfer-factory")) {
        return new Response(new Uint8Array([1, 2, 3]));
      }
      if (url.endsWith("/v2/interactive-submission/prepare")) {
        return new Response(new Uint8Array([4, 5, 6]));
      }
      throw new Error(`unexpected test URL ${url} ${String(init?.method)}`);
    });
    const transport = createTransport(fetcher);

    await expect(transport.readLedgerEnd()).resolves.toEqual({ offset: 42 });
    await expect(transport.readCapabilityContracts(42)).resolves.toEqual([]);
    await expect(transport.readHoldingContracts(42)).resolves.toEqual([]);
    await expect(transport.readRegistry("{}")).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    await expect(
      transport.readPrepare({ commandId: "sotto-test" } as never),
    ).resolves.toEqual(new Uint8Array([4, 5, 6]));

    const calls = fetcher.mock.calls.slice(1);
    expect(
      fetcher.mock.calls.filter(([url]) => url === network.tokenUrl),
    ).toHaveLength(1);
    expect(calls.map(([url]) => url)).toEqual([
      `${network.ledgerUrl}/v2/state/ledger-end`,
      `${network.ledgerUrl}/v2/state/active-contracts`,
      `${network.ledgerUrl}/v2/state/active-contracts`,
      `${network.validatorUrl}/registry/transfer-instruction/v1/transfer-factory`,
      `${network.ledgerUrl}/v2/interactive-submission/prepare`,
    ]);
    for (const [, init] of calls) {
      expect(init).toMatchObject({ redirect: "error" });
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer test-access-token",
      );
    }
  });

  it("rejects a streamed response beyond the operation limit", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === network.tokenUrl) return tokenResponse();
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(1_500_000));
            controller.enqueue(new Uint8Array(600_001));
            controller.close();
          },
        }),
      );
    });
    const transport = createTransport(fetcher);

    await expect(transport.readCapabilityContracts(42)).rejects.toThrow(
      /byte limit/i,
    );
  });

  it("returns bounded diagnostics without leaking response bodies", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === network.tokenUrl) return tokenResponse();
      return Response.json(
        { code: "INVALID_ARGUMENT", message: "bad request", secret: "hide" },
        { status: 400 },
      );
    });
    const transport = createTransport(fetcher);

    await expect(transport.readLedgerEnd()).rejects.toThrow(
      "HTTP 400 (INVALID_ARGUMENT)",
    );
    await expect(transport.readLedgerEnd()).rejects.not.toThrow(/hide/);
    await expect(transport.readLedgerEnd()).rejects.not.toThrow(/bad request/);
  });

  it.each([
    ["issuerUrl", "https://attacker.example/application/o/client"],
    ["tokenUrl", "https://attacker.example/token"],
    ["ledgerUrl", "https://attacker.example"],
    ["validatorUrl", "https://attacker.example/api/validator"],
  ] as const)(
    "rejects an unapproved %s before minting a token",
    (key, value) => {
      const fetcher = vi.fn(async () => tokenResponse());

      expect(() =>
        createFiveNorthPrepareTransport({ ...network, [key]: value }, PAYER, {
          fetcher,
          signal: new AbortController().signal,
        }),
      ).toThrow(/approved Five North/);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("binds both ACS operations to one Sotto payer and hardcoded filters", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === network.tokenUrl) return tokenResponse();
      expect(url).toBe(`${network.ledgerUrl}/v2/state/active-contracts`);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(JSON.stringify(body)).toContain(PAYER);
      expect(JSON.stringify(body)).not.toContain("unrelated-party");
      return Response.json([]);
    });
    const transport = createTransport(fetcher);

    await transport.readCapabilityContracts(42);
    await transport.readHoldingContracts(42);
    expect(transport).not.toHaveProperty("readActiveContracts");
  });

  it("recovers after token-mint failure and refreshes an expired token", async () => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:00.000Z") });
    try {
      let mint = 0;
      const fetcher = vi.fn(async (url: string) => {
        if (url === network.tokenUrl) {
          mint += 1;
          if (mint === 1) throw new Error("temporary identity outage");
          return Response.json({
            access_token: `token-${mint}`,
            expires_in: 600,
          });
        }
        return Response.json({ offset: 42 });
      });
      const transport = createTransport(fetcher);

      await expect(transport.readLedgerEnd()).rejects.toThrow(
        "temporary identity outage",
      );
      await expect(transport.readLedgerEnd()).resolves.toEqual({ offset: 42 });
      await vi.advanceTimersByTimeAsync(541_000);
      await expect(transport.readLedgerEnd()).resolves.toEqual({ offset: 42 });
      expect(mint).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("invalidates a rejected bearer and retries exactly once", async () => {
    let mint = 0;
    let ledger = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url === network.tokenUrl) {
        mint += 1;
        return Response.json({
          access_token: `token-${mint}`,
          expires_in: 28_800,
        });
      }
      ledger += 1;
      return ledger === 1
        ? new Response(null, { status: 401 })
        : Response.json({ offset: 42 });
    });
    const transport = createTransport(fetcher);

    await expect(transport.readLedgerEnd()).resolves.toEqual({ offset: 42 });
    expect({ mint, ledger }).toEqual({ mint: 2, ledger: 2 });
  });

  it("rejects malformed content-length and cancels its body", async () => {
    let cancelled = false;
    const fetcher = vi.fn(async (url: string) => {
      if (url === network.tokenUrl) return tokenResponse();
      return new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "content-length": "-1" } },
      );
    });
    const transport = createTransport(fetcher);

    await expect(transport.readLedgerEnd()).rejects.toThrow(/content-length/i);
    expect(cancelled).toBe(true);
  });

  it("does not mint or retry when the purchase scope is cancelled", async () => {
    const controller = new AbortController();
    controller.abort("do not expose this reason");
    const fetcher = vi.fn(async () => tokenResponse());
    const transport = createTransport(fetcher, controller.signal);

    const promise = transport.readLedgerEnd();
    await expect(promise).rejects.toThrow("prepare scope cancelled");
    await expect(promise).rejects.not.toThrow(/expose this reason/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not retry a 401 after the purchase scope is cancelled", async () => {
    const controller = new AbortController();
    let ledger = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url === network.tokenUrl) return tokenResponse();
      ledger += 1;
      controller.abort("private cancellation");
      return new Response(null, { status: 401 });
    });
    const transport = createTransport(fetcher, controller.signal);

    await expect(transport.readLedgerEnd()).rejects.toThrow(
      "prepare scope cancelled",
    );
    expect(ledger).toBe(1);
  });
});
