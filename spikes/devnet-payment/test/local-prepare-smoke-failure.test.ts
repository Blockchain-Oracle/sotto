import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runLocalPrepareSmoke } from "../src/local-prepare-smoke.js";

const bootstrap = {
  admin: "sotto-local-prepare-admin::1220participant",
  agent: "sotto-local-prepare-agent::1220participant",
  capabilityCid: "00capability",
  executeBefore: "2026-07-13T11:00:00.000000Z",
  expiresAt: "2026-07-13T12:00:00.000000Z",
  holdingCid: "00holding",
  mockHoldingCid: "00holding",
  mockTransferFactoryCid: "00factory",
  payer: "sotto-local-prepare-payer::1220participant",
  provider: "sotto-local-prepare-provider::1220participant",
  requestedAt: "2026-07-13T09:59:59.000000Z",
  transferFactoryCid: "00factory",
};

function activeContract(contractId: string, entity: string) {
  return {
    contractEntry: {
      JsActiveContract: {
        createdEvent: {
          contractId,
          createdEventBlob: Buffer.alloc(32, 7).toString("base64"),
          templateId: `${"a".repeat(64)}:SottoControlTokenStandardMock:${entity}`,
        },
        synchronizerId: "synchronizer::1220local",
      },
    },
  };
}

describe("local prepare-only smoke failures", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:10.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not persist a response whose wallet precheck mismatches", async () => {
    const persistRaw = vi.fn(async () => undefined);
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/v2/state/ledger-end")) {
        return Response.json({ offset: 42 });
      }
      if (target.endsWith("/v2/state/active-contracts")) {
        return Response.json([
          activeContract("00factory", "MockTransferFactory"),
          activeContract("00holding", "MockHolding"),
        ]);
      }
      if (target.endsWith("/v2/interactive-submission/prepare")) {
        return Response.json({
          hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
          preparedTransaction: Buffer.from("prepared").toString("base64"),
          preparedTransactionHash: Buffer.alloc(32, 7).toString("base64"),
        });
      }
      throw new Error("unexpected local request");
    });

    await expect(
      runLocalPrepareSmoke({
        baseUrl: "http://127.0.0.1:7575",
        bootstrap,
        fetcher,
        persistRaw,
        recomputePrecheck: async () => new Uint8Array(32).fill(8),
      }),
    ).rejects.toThrow(/precheck does not match/i);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(persistRaw).not.toHaveBeenCalled();
  });
});
