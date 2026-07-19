import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { readCapabilityBootstrapCompletion } from "../../spikes/devnet-payment/src/capability-bootstrap-completion.js";
import { readSpikeConfig } from "../../spikes/devnet-payment/src/config.js";
import { createFiveNorthCapabilityCompletionPageReader } from "../../spikes/devnet-payment/src/five-north-capability-completion-transport.js";
import { createFiveNorthPrepareTransport } from "../../spikes/devnet-payment/src/five-north-prepare-transport.js";
import { createFiveNorthTokenProvider } from "../../spikes/devnet-payment/src/five-north-token.js";

const root = new URL("../..", import.meta.url);
loadEnvFile(new URL(".env.local", root));
const config = readSpikeConfig(process.env);
const journal = JSON.parse(
  await readFile(
    new URL(
      ".capability-wallet/live-external-agent-purchase-started.json",
      root,
    ),
    "utf8",
  ),
) as Record<string, unknown>;
if (
  journal.version !== "sotto-live-agent-purchase-v1" ||
  !Number.isSafeInteger(journal.beginExclusive) ||
  typeof journal.agentParty !== "string" ||
  typeof journal.commandId !== "string" ||
  typeof journal.userId !== "string"
) {
  throw new Error("live purchase journal is invalid");
}
const agentParty = journal.agentParty;
const controller = new AbortController();
const transport = createFiveNorthPrepareTransport(config.network, agentParty, {
  signal: controller.signal,
});
const tokenProvider = createFiveNorthTokenProvider(
  config.network,
  fetch,
  controller.signal,
);
const readPage = createFiveNorthCapabilityCompletionPageReader({
  fetcher: fetch,
  ledgerUrl: config.network.ledgerUrl,
  payerParty: agentParty,
  signal: controller.signal,
  tokenProvider,
});

try {
  const completion = await readCapabilityBootstrapCompletion({
    beginExclusive: journal.beginExclusive as number,
    readLedgerEndOffset: async () => {
      const value = (await transport.readLedgerEnd()) as { offset?: unknown };
      if (!Number.isSafeInteger(value.offset)) {
        throw new Error("live purchase Ledger end is invalid");
      }
      return value.offset as number;
    },
    readPage,
    request: {
      actAs: [agentParty],
      commandId: journal.commandId,
      userId: journal.userId,
    } as never,
  });
  process.stdout.write(`${JSON.stringify({ completion })}\n`);
} finally {
  controller.abort();
}
