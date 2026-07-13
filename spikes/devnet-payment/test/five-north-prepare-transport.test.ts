import { describe, expect, it, vi } from "vitest";
import {
  createFiveNorthPrepareTransport,
  type FiveNorthPrepareTransport,
} from "../src/five-north-prepare-transport.js";
import type { SpikeConfig } from "../src/config.js";

const network: SpikeConfig["network"] = {
  audience: "validator-devnet-m2m",
  clientId: "test-client",
  clientSecret: "test-secret",
  issuerUrl: "https://identity.example/application/o/test/",
  ledgerUrl: "https://ledger.example",
  scope: "daml_ledger_api",
  tokenUrl: "https://identity.example/application/o/token/",
  validatorUrl: "https://wallet.example/api/validator",
};

function tokenResponse(): Response {
  return Response.json({ access_token: "test-access-token" });
}

describe("Five North prepare-only transport", () => {
  it("exposes only bounded read and prepare operations", () => {
    const transport = createFiveNorthPrepareTransport(
      network,
      vi.fn(async () => tokenResponse()),
    );

    expect(Object.keys(transport).sort()).toEqual([
      "readActiveContracts",
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
    const transport = createFiveNorthPrepareTransport(network, fetcher);

    await expect(transport.readLedgerEnd()).resolves.toEqual({ offset: 42 });
    await expect(
      transport.readActiveContracts({ filter: {}, activeAtOffset: 42 }),
    ).resolves.toEqual([]);
    await expect(
      transport.readRegistry({
        body: "{}",
        contentType: "application/json",
        maximumResponseBytes: 2_000_000,
        method: "POST",
        path: "/registry/transfer-instruction/v1/transfer-factory",
        redirect: "error",
        registryAdmin: "sotto-admin::1220admin",
        timeoutMilliseconds: 10_000,
      }),
    ).resolves.toEqual(new Uint8Array([1, 2, 3]));
    await expect(
      transport.readPrepare({
        body: { commandId: "sotto-test" } as never,
        contentType: "application/json",
        maximumResponseBytes: 8_388_608,
        method: "POST",
        path: "/v2/interactive-submission/prepare",
        redirect: "error",
        timeoutMilliseconds: 10_000,
      }),
    ).resolves.toEqual(new Uint8Array([4, 5, 6]));

    const calls = fetcher.mock.calls.slice(1);
    expect(
      fetcher.mock.calls.filter(([url]) => url === network.tokenUrl),
    ).toHaveLength(1);
    expect(calls.map(([url]) => url)).toEqual([
      `${network.ledgerUrl}/v2/state/ledger-end`,
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
    const transport = createFiveNorthPrepareTransport(network, fetcher);

    await expect(
      transport.readActiveContracts({ filter: {}, activeAtOffset: 42 }),
    ).rejects.toThrow(/byte limit/i);
  });

  it("returns bounded diagnostics without leaking response bodies", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === network.tokenUrl) return tokenResponse();
      return Response.json(
        { code: "INVALID_ARGUMENT", message: "bad request", secret: "hide" },
        { status: 400 },
      );
    });
    const transport = createFiveNorthPrepareTransport(network, fetcher);

    await expect(transport.readLedgerEnd()).rejects.toThrow(
      "HTTP 400 (INVALID_ARGUMENT: bad request)",
    );
    await expect(transport.readLedgerEnd()).rejects.not.toThrow(/hide/);
  });
});
