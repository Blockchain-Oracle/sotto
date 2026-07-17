import { expect, it, vi } from "vitest";
import type { SpikeConfig } from "../src/config.js";
import { createFiveNorthHumanProviderTransactionReader } from "../src/five-north-human-provider-transaction.js";

const USER = "validator-devnet-m2m";
const PROVIDER = `sotto-provider::1220${"a".repeat(64)}`;
const UPDATE = `1220${"b".repeat(64)}`;
const network: SpikeConfig["network"] = {
  audience: USER,
  clientId: USER,
  clientSecret: "private-test-secret",
  issuerUrl:
    "https://auth.sandbox.fivenorth.io/application/o/validator-devnet-m2m",
  ledgerUrl: "https://ledger-api.validator.devnet.sandbox.fivenorth.io",
  scope: "daml_ledger_api",
  tokenUrl: "https://auth.sandbox.fivenorth.io/application/o/token/",
  validatorUrl:
    "https://wallet.validator.devnet.sandbox.fivenorth.io/api/validator",
};

function token(): Response {
  const payload = Buffer.from(JSON.stringify({ sub: USER })).toString(
    "base64url",
  );
  return Response.json({
    access_token: `header.${payload}.signature`,
    expires_in: 28_800,
  });
}

it("reads one exact provider-visible Ledger-effects transaction", async () => {
  const transaction = { transaction: { updateId: UPDATE, events: [] } };
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (url === network.tokenUrl) return token();
    expect(url).toBe(`${network.ledgerUrl}/v2/updates/transaction-by-id`);
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.headers).toMatchObject({
      authorization: expect.stringMatching(/^Bearer /u),
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      updateId: UPDATE,
      transactionFormat: {
        eventFormat: {
          filtersByParty: {
            [PROVIDER]: {
              cumulative: [
                {
                  identifierFilter: {
                    WildcardFilter: {
                      value: { includeCreatedEventBlob: false },
                    },
                  },
                },
              ],
            },
          },
          verbose: false,
        },
        transactionShape: "TRANSACTION_SHAPE_LEDGER_EFFECTS",
      },
    });
    return Response.json(transaction);
  });
  const reader = createFiveNorthHumanProviderTransactionReader(
    network,
    PROVIDER,
    { fetcher, signal: new AbortController().signal },
  );

  await expect(reader(UPDATE)).resolves.toEqual(transaction);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each([
  ["empty", ""],
  ["non-Canton", "transaction-7"],
  ["uppercase", `1220${"A".repeat(64)}`],
] as const)(
  "rejects a %s update before network I/O",
  async (_label, update) => {
    const fetcher = vi.fn<typeof fetch>();
    const reader = createFiveNorthHumanProviderTransactionReader(
      network,
      PROVIDER,
      { fetcher, signal: new AbortController().signal },
    );

    await expect(reader(update)).rejects.toThrow(/update ID/iu);
    expect(fetcher).not.toHaveBeenCalled();
  },
);
