import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runLocalPrepareSmoke } from "../src/local-prepare-smoke.js";

const bootstrap = {
  admin: "sotto-local-prepare-admin::1220participant",
  agent: "sotto-local-prepare-agent::1220participant",
  capabilityCid: "00capability",
  createdAt: "2026-07-13T10:00:00.000000Z",
  executeBefore: "2026-07-13T11:00:00.000000Z",
  expiresAt: "2026-07-13T12:00:00.000000Z",
  holdingAmount: 2,
  holdingCid: "00holding",
  instrumentAdmin: "sotto-local-prepare-admin::1220participant",
  instrumentId: "Amulet",
  mockHoldingCid: "00holding",
  mockTransferFactoryCid: "00factory",
  payer: "sotto-local-prepare-payer::1220participant",
  provider: "sotto-local-prepare-provider::1220participant",
  requestedAt: "2026-07-13T09:59:59.000000Z",
  transferFactoryCid: "00factory",
};

function activeContract(
  contractId: string,
  entity: string,
  synchronizerId = "synchronizer-1::1220sync",
  blobBytes = 20,
) {
  return {
    contractEntry: {
      JsActiveContract: {
        createdEvent: {
          contractId,
          createdEventBlob: Buffer.alloc(blobBytes, 7).toString("base64"),
          templateId: `${"a".repeat(64)}:SottoControlTokenStandardMock:${entity}`,
        },
        synchronizerId,
      },
    },
  };
}

function preparedResponse(): Response {
  return Response.json({
    preparedTransaction: Buffer.from("prepared-local-protobuf").toString(
      "base64",
    ),
    preparedTransactionHash: Buffer.alloc(32, 7).toString("base64"),
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
  });
}

describe("local prepare-only smoke", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:10.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prepares one agent-only mock purchase without sign or execute", async () => {
    const persistRaw = vi.fn(async () => undefined);
    const recomputePrecheck = vi.fn(async () => new Uint8Array(32).fill(7));
    const fetcher = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.endsWith("/v2/state/ledger-end")) {
          return Response.json({ offset: 42 });
        }
        if (target.endsWith("/v2/state/active-contracts")) {
          return Response.json([
            activeContract("00factory", "MockTransferFactory", undefined, 600),
            activeContract("00holding", "MockHolding", undefined, 900),
          ]);
        }
        if (target.endsWith("/v2/interactive-submission/prepare")) {
          const body = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;
          expect(body).toMatchObject({
            actAs: [bootstrap.agent],
            disclosedContracts: expect.arrayContaining([
              expect.objectContaining({ contractId: "00factory" }),
              expect.objectContaining({ contractId: "00holding" }),
            ]),
            readAs: [],
            userId: "daml-script",
          });
          expect(JSON.stringify(body)).not.toContain("executeSubmission");
          expect(JSON.stringify(body)).not.toContain("signature");
          return preparedResponse();
        }
        throw new Error(`unexpected local URL ${target}`);
      },
    );

    await expect(
      runLocalPrepareSmoke({
        baseUrl: "http://127.0.0.1:7575",
        bootstrap,
        fetcher,
        persistRaw,
        recomputePrecheck,
      }),
    ).resolves.toMatchObject({
      canonicalParticipantHashBytes: 32,
      fixture: "local-mock-effects",
      precheckMatches: true,
      status: "prepared-local-mock-not-signed",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(
      fetcher.mock.calls.map(([url, init]) => [String(url), init?.method]),
    ).toEqual([
      ["http://127.0.0.1:7575/v2/state/ledger-end", "GET"],
      ["http://127.0.0.1:7575/v2/state/active-contracts", "POST"],
      ["http://127.0.0.1:7575/v2/interactive-submission/prepare", "POST"],
    ]);
    expect(recomputePrecheck).toHaveBeenCalledOnce();
    expect(persistRaw).toHaveBeenCalledOnce();
  });

  it("rejects mismatched disclosure synchronizers before prepare", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/v2/state/ledger-end")) {
        return Response.json({ offset: 42 });
      }
      if (target.endsWith("/v2/state/active-contracts")) {
        return Response.json([
          activeContract("00factory", "MockTransferFactory", "sync-a"),
          activeContract("00holding", "MockHolding", "sync-b"),
        ]);
      }
      throw new Error("prepare must not be called");
    });

    await expect(
      runLocalPrepareSmoke({
        baseUrl: "http://127.0.0.1:7575",
        bootstrap,
        fetcher,
        persistRaw: async () => undefined,
        recomputePrecheck: async () => new Uint8Array(32),
      }),
    ).rejects.toThrow(/synchronizer/i);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects a non-loopback base URL before network access", async () => {
    const fetcher = vi.fn(async () => Response.json({ offset: 42 }));

    await expect(
      runLocalPrepareSmoke({
        baseUrl: "https://ledger.example",
        bootstrap,
        fetcher,
        persistRaw: async () => undefined,
        recomputePrecheck: async () => new Uint8Array(32),
      }),
    ).rejects.toThrow(/loopback/i);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
