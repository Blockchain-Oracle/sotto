import { expect, it, vi } from "vitest";
import type { SpikeConfig } from "../src/config.js";
import { createFiveNorthHumanWalletCompletionTransport } from "../src/five-north-human-wallet-completion.js";

const PAYER = `sotto-external-payer::1220${"a".repeat(64)}`;
const USER = "validator-devnet-m2m";
const COMMAND = `sotto-human-purchase-v1-${"b".repeat(64)}`;
const UPDATE = `1220${"c".repeat(64)}`;
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

it("reconciles the exact human command to its terminal update", async () => {
  const requests: Array<{ body?: unknown; url: string }> = [];
  let ledgerEndReads = 0;
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (url === network.tokenUrl) return token();
    requests.push({
      url: String(url),
      ...(init?.body === undefined
        ? {}
        : { body: JSON.parse(String(init.body)) as unknown }),
    });
    if (url === `${network.ledgerUrl}/v2/state/ledger-end`) {
      ledgerEndReads += 1;
      return Response.json({ offset: ledgerEndReads === 1 ? 42 : 43 });
    }
    return Response.json([
      {
        completionResponse: {
          Completion: {
            value: {
              actAs: [PAYER],
              commandId: COMMAND,
              offset: 43,
              status: { code: 0 },
              updateId: UPDATE,
              userId: USER,
            },
          },
        },
      },
    ]);
  });
  const transport = createFiveNorthHumanWalletCompletionTransport(
    network,
    PAYER,
    { fetcher, signal: new AbortController().signal },
  );

  const beginExclusive = await transport.readLedgerEnd();
  const result = await transport.awaitCompletion({
    beginExclusive,
    commandId: COMMAND,
    userId: USER,
  });

  expect(result).toEqual({
    classification: "SUCCEEDED",
    completionOffset: 43,
    updateId: UPDATE,
  });
  expect(requests).toContainEqual({
    url: `${network.ledgerUrl}/v2/commands/completions?limit=1000&stream_idle_timeout_ms=250`,
    body: { beginExclusive: 42, parties: [PAYER], userId: USER },
  });
});
