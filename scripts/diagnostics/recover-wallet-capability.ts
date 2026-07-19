import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { recoverCapabilityWalletBootstrap } from "../../spikes/devnet-payment/src/capability-wallet-bootstrap-recovery.js";
import { loadCapabilityBootstrapJournalState } from "../../spikes/devnet-payment/src/capability-bootstrap-journal.js";
import { readCapabilityBootstrapCompletion } from "../../spikes/devnet-payment/src/capability-bootstrap-completion.js";
import { readSpikeConfig } from "../../spikes/devnet-payment/src/config.js";
import { createFiveNorthCapabilityCompletionPageReader } from "../../spikes/devnet-payment/src/five-north-capability-completion-transport.js";
import { createFiveNorthPrepareTransport } from "../../spikes/devnet-payment/src/five-north-prepare-transport.js";
import { createFiveNorthTokenProvider } from "../../spikes/devnet-payment/src/five-north-token.js";

const workspaceRoot = resolve(new URL("../..", import.meta.url).pathname);
loadEnvFile(resolve(workspaceRoot, ".env.local"));
const config = readSpikeConfig(process.env);
const payerParty =
  "sotto-external-payer::1220e5e6be928d5264069d480d0c30198236a71e2af7d42f519841483fc83fe8b012";
const controller = new AbortController();
const prepare = createFiveNorthPrepareTransport(config.network, payerParty, {
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
  payerParty,
  signal: controller.signal,
  tokenProvider,
});
const readLedgerEndOffset = async () => {
  const value = (await prepare.readLedgerEnd()) as { offset?: unknown };
  if (!Number.isSafeInteger(value.offset)) throw new Error("invalid offset");
  return value.offset as number;
};

try {
  const active = (await prepare.readCapabilityContracts(
    await readLedgerEndOffset(),
  )) as Array<Record<string, unknown>>;
  const expiries = active.flatMap((entry) => {
    const created = (
      (entry.contractEntry as Record<string, unknown>)?.JsActiveContract as
        Record<string, unknown> | undefined
    )?.createdEvent as Record<string, unknown> | undefined;
    const argument = created?.createArgument as
      Record<string, unknown> | undefined;
    return argument?.payer === payerParty
      ? [{ contractId: created?.contractId, expiresAt: argument.expiresAt }]
      : [];
  });
  process.stdout.write(`${JSON.stringify({ expiries })}\n`);
  const state = await loadCapabilityBootstrapJournalState(workspaceRoot);
  const result = await recoverCapabilityWalletBootstrap({
    readActiveCapabilities: async () =>
      prepare.readCapabilityContracts(await readLedgerEndOffset()),
    readCompletion: (beginExclusive, request) =>
      readCapabilityBootstrapCompletion({
        beginExclusive,
        readLedgerEndOffset,
        readPage,
        request,
      }),
    sourceCommit: state.intent.sourceCommit,
    workspaceRoot,
  });
  process.stdout.write(`${JSON.stringify({ result, status: "RECOVERED" })}\n`);
} finally {
  controller.abort();
}
