import { loadEnvFile } from "node:process";
import { readSpikeConfig } from "../../spikes/devnet-payment/src/config.js";
import { createFiveNorthPrepareTransport } from "../../spikes/devnet-payment/src/five-north-prepare-transport.js";

loadEnvFile(new URL("../../.env.local", import.meta.url));
const config = readSpikeConfig(process.env);
const scope = new AbortController();
try {
  const transport = createFiveNorthPrepareTransport(
    config.network,
    "sotto-external-payer::1220e5e6be928d5264069d480d0c30198236a71e2af7d42f519841483fc83fe8b012",
    { signal: scope.signal },
  );
  const preapproval = (await transport.readTransferPreapproval(
    config.provider.party,
  )) as Record<string, unknown> | null;
  process.stdout.write(
    `${JSON.stringify({ present: preapproval !== null, status: "OBSERVED" })}\n`,
  );
} finally {
  scope.abort();
}
