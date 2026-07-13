import { describe, expect, it, vi } from "vitest";
import { createFiveNorthClient } from "../src/five-north.js";

const network = {
  audience: "ledger-audience",
  clientId: "client-id",
  clientSecret: "client-secret",
  issuerUrl: "https://issuer.example/application/o/client/",
  ledgerUrl: "https://ledger.example",
  scope: "daml_ledger_api",
  tokenUrl: "https://issuer.example/application/o/token/",
  validatorUrl: "https://validator.example/api/validator",
};
const updateId = `1220${"a".repeat(64)}`;
const provider = "sotto-spike-provider::1220participant";

function token(): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({ sub: "ledger-user-6" }),
  ).toString("base64url");
  return `${header}.${payload}.signature`;
}

describe("createFiveNorthClient", () => {
  it("exposes the authenticated user and numeric ledger end", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === network.tokenUrl) {
        return Response.json({ access_token: token(), expires_in: 28_800 });
      }
      if (String(url) === `${network.ledgerUrl}/v2/state/ledger-end`) {
        return Response.json({ offset: 42 });
      }
      return new Response("unexpected", { status: 500 });
    });
    const client = createFiveNorthClient(network, fetcher);

    await expect(client.getUserId()).resolves.toBe("ledger-user-6");
    await expect(client.getLedgerEnd()).resolves.toBe(42);
  });

  it("surfaces bounded structured API rejection details", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === network.tokenUrl) {
        return Response.json({ access_token: token(), expires_in: 28_800 });
      }
      return Response.json(
        {
          code: "INVALID_ARGUMENT",
          message: "missing disclosed contract",
          traceId: "private-trace-id",
        },
        { status: 400 },
      );
    });
    const client = createFiveNorthClient(network, fetcher);

    await expect(client.getTransaction(updateId, provider)).rejects.toThrow(
      "HTTP 400 (INVALID_ARGUMENT: missing disclosed contract)",
    );
  });

  it("fetches one transaction by update ID with a provider-scoped format", async () => {
    const transaction = {
      transaction: { events: [], synchronizerId: "sync", updateId },
    };
    const fetcher = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        void init;
        const target = String(url);
        if (target === network.tokenUrl) {
          return Response.json({ access_token: token(), expires_in: 28_800 });
        }
        if (target === `${network.ledgerUrl}/v2/updates/transaction-by-id`) {
          return Response.json(transaction);
        }
        return new Response("unexpected", { status: 500 });
      },
    );
    const client = createFiveNorthClient(network, fetcher);

    await expect(client.getTransaction(updateId, provider)).resolves.toEqual(
      transaction,
    );
    const transactionCall = fetcher.mock.calls[1];
    expect(transactionCall?.[0]).toBe(
      `${network.ledgerUrl}/v2/updates/transaction-by-id`,
    );
    const init = transactionCall?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      updateId,
      transactionFormat: {
        eventFormat: { filtersByParty: { [provider]: {} } },
        transactionShape: "TRANSACTION_SHAPE_LEDGER_EFFECTS",
      },
    });
    expect(JSON.parse(String(init.body))).not.toHaveProperty("updateFormat");
  });

  it("submits one idempotent settlement command and returns its update", async () => {
    const settlement = { commandId: "sotto-settle-command", commands: [] };
    const fetcher = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        void init;
        const target = String(url);
        if (target === network.tokenUrl) {
          return Response.json({ access_token: token(), expires_in: 28_800 });
        }
        if (target === `${network.ledgerUrl}/v2/commands/submit-and-wait`) {
          return Response.json({ completionOffset: 42, updateId });
        }
        return new Response("unexpected", { status: 500 });
      },
    );
    const client = createFiveNorthClient(network, fetcher);

    await expect(client.submitSettlement(settlement)).resolves.toEqual({
      completionOffset: 42,
      updateId,
    });
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual(
      settlement,
    );
  });

  it("loads only the payer's unlocked CC holding and current Scan inputs", async () => {
    const payer = "sotto-spike-payer::1220participant";
    const rules = {
      contract: {
        contract_id: "rules-cid",
        created_event_blob: "rules-blob",
        payload: { dso: "DSO::1220dso" },
        template_id: "rules-template",
      },
      domain_id: "global-domain::1220sync",
    };
    const rounds = [{ contract: { payload: { round: { number: "42" } } } }];
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target === network.tokenUrl) {
        return Response.json({ access_token: token(), expires_in: 28_800 });
      }
      if (target === `${network.validatorUrl}/v0/scan-proxy/amulet-rules`) {
        return Response.json({ amulet_rules: rules });
      }
      if (
        target ===
        `${network.validatorUrl}/v0/scan-proxy/open-and-issuing-mining-rounds`
      ) {
        return Response.json({
          issuing_mining_rounds: [],
          open_mining_rounds: rounds,
        });
      }
      if (target === `${network.ledgerUrl}/v2/state/ledger-end`) {
        return Response.json({ offset: 42 });
      }
      if (target === `${network.ledgerUrl}/v2/state/active-contracts`) {
        return Response.json([
          {
            contractEntry: {
              JsActiveContract: {
                createdEvent: {
                  contractId: "payer-holding-cid",
                  interfaceViews: [
                    {
                      viewValue: {
                        amount: "10.0000000000",
                        instrumentId: {
                          admin: "DSO::1220dso",
                          id: "Amulet",
                        },
                        lock: null,
                        owner: payer,
                      },
                    },
                  ],
                },
              },
            },
          },
        ]);
      }
      return new Response("unexpected", { status: 500 });
    });
    const client = createFiveNorthClient(network, fetcher);

    await expect(client.loadSettlementState(payer)).resolves.toEqual({
      amuletRules: rules,
      openMiningRounds: rounds,
      payerHolding: {
        amount: "10.0000000000",
        contractId: "payer-holding-cid",
        instrumentId: { admin: "DSO::1220dso", id: "Amulet" },
        owner: payer,
      },
      userId: "ledger-user-6",
    });
  });
});
