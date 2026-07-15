import { buildBoundedCapabilityBootstrap } from "@sotto/x402-canton";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const suffix = `::1220${"a".repeat(64)}`;
const payer = `sotto-payer${suffix}`;

async function moduleUnderTest() {
  try {
    return await import("../src/five-north-capability-bootstrap-transport.js");
  } catch (error) {
    throw new Error("CAPABILITY_BOOTSTRAP_TRANSPORT_NOT_IMPLEMENTED", {
      cause: error,
    });
  }
}

function tokenResponse(subject = "ledger-user-6"): Response {
  const payload = Buffer.from(JSON.stringify({ sub: subject })).toString(
    "base64url",
  );
  return Response.json({
    access_token: `header.${payload}.signature`,
    expires_in: 28_800,
  });
}

function request(userId = "ledger-user-6") {
  return buildBoundedCapabilityBootstrap({
    agentParty: `sotto-agent${suffix}`,
    allowedRecipient: `sotto-provider${suffix}`,
    allowedResourceHash: `sha256:${"b".repeat(64)}`,
    expiresAt: "2026-07-14T11:00:00.000Z",
    instrument: { admin: `DSO${suffix}`, id: "Amulet" },
    maximumTotalDebitAtomic: "3250000000",
    payerParty: payer,
    perCallLimitAtomic: "2500000000",
    remainingAllowanceAtomic: "3250000000",
    synchronizerId: `global-domain${suffix}`,
    transferFactoryContractId: "00factory",
    userId,
  });
}

describe("Five North capability bootstrap transport", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-14T10:00:00.000Z") });
  });

  afterEach(() => vi.useRealTimers());

  it("shares one token and exposes only bootstrap operations", async () => {
    const { createFiveNorthCapabilityBootstrapTransport } =
      await moduleUnderTest();
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === network.tokenUrl) return tokenResponse();
      if (url.endsWith("/v2/state/ledger-end")) {
        return Response.json({ offset: 42 });
      }
      if (url.endsWith("/v2/state/active-contracts")) {
        return Response.json([]);
      }
      if (url.includes("/v2/commands/completions?")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          beginExclusive: 41,
          parties: [payer],
          userId: "ledger-user-6",
        });
        return Response.json([
          {
            completionResponse: {
              OffsetCheckpoint: { value: { offset: 42 } },
            },
          },
        ]);
      }
      if (url.endsWith("/v2/commands/submit-and-wait")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual(request());
        return Response.json({
          completionOffset: 42,
          updateId: `1220${"c".repeat(64)}`,
        });
      }
      throw new Error("unexpected test route");
    });
    const transport = createFiveNorthCapabilityBootstrapTransport(
      network,
      payer,
      { fetcher, signal: new AbortController().signal },
    );

    await expect(transport.readiness.readAuthenticatedUserId()).resolves.toBe(
      "ledger-user-6",
    );
    await expect(transport.readActiveCapabilities()).resolves.toEqual([]);
    await expect(transport.readLedgerEndOffset()).resolves.toBe(42);
    await expect(
      transport.readCompletionPage({
        beginExclusive: 41,
        limit: 1_000,
        parties: [payer],
        userId: "ledger-user-6",
      }),
    ).resolves.toEqual([
      {
        completionResponse: {
          OffsetCheckpoint: { value: { offset: 42 } },
        },
      },
    ]);
    await expect(transport.submit(request())).resolves.toEqual({
      completionOffset: 42,
      updateId: `1220${"c".repeat(64)}`,
    });
    expect(
      fetcher.mock.calls.filter(([url]) =>
        url.endsWith("/v2/commands/submit-and-wait"),
      ),
    ).toHaveLength(1);

    expect(
      fetcher.mock.calls.filter(([url]) => url === network.tokenUrl),
    ).toHaveLength(1);
    expect(Object.keys(transport).sort()).toEqual([
      "factory",
      "networkCallCounts",
      "readActiveCapabilities",
      "readCompletionPage",
      "readLedgerEndOffset",
      "readiness",
      "submit",
    ]);
    expect(JSON.stringify(Object.keys(transport))).not.toMatch(
      /prepare|provider|payment|faucet|sign|execute/iu,
    );
  });

  it("rejects submission-token subject drift before dispatch", async () => {
    const { createFiveNorthCapabilityBootstrapTransport } =
      await moduleUnderTest();
    const fetcher = vi.fn(async (url: string) =>
      url === network.tokenUrl
        ? tokenResponse("different-ledger-user")
        : Response.json({ transaction: {} }),
    );
    const transport = createFiveNorthCapabilityBootstrapTransport(
      network,
      payer,
      { fetcher, signal: new AbortController().signal },
    );

    await expect(transport.submit(request())).rejects.toThrow(/subject/iu);
    expect(
      fetcher.mock.calls.filter(([url]) => url.endsWith("/submit-and-wait")),
    ).toHaveLength(0);
  });

  it("permits at most one transaction submission", async () => {
    const { createFiveNorthCapabilityBootstrapTransport } =
      await moduleUnderTest();
    const fetcher = vi.fn(async (url: string) =>
      url === network.tokenUrl
        ? tokenResponse()
        : Response.json({ transaction: {} }),
    );
    const transport = createFiveNorthCapabilityBootstrapTransport(
      network,
      payer,
      { fetcher, signal: new AbortController().signal },
    );

    await transport.submit(request());
    await expect(transport.submit(request())).rejects.toThrow(/limit/iu);
    expect(
      fetcher.mock.calls.filter(([url]) => url.endsWith("/submit-and-wait")),
    ).toHaveLength(1);
  });

  it("rejects unlisted endpoints and cancellation before network", async () => {
    const { createFiveNorthCapabilityBootstrapNetworkGuard } =
      await moduleUnderTest();
    const controller = new AbortController();
    const fetcher = vi.fn(async () => Response.json({}));
    const guarded = createFiveNorthCapabilityBootstrapNetworkGuard(network, {
      fetcher,
      signal: controller.signal,
    });

    await expect(
      guarded("https://provider.example.test/paid", { method: "GET" }),
    ).rejects.toThrow(/boundary/iu);
    controller.abort();
    await expect(guarded(network.tokenUrl, { method: "POST" })).rejects.toThrow(
      /cancelled/iu,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
