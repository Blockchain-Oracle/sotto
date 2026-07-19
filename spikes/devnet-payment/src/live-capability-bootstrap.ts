import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readCleanSourceCheckpoint } from "./clean-source-checkpoint.js";
import { readSpikeConfig } from "./config.js";
import { createFiveNorthCapabilityBootstrapTransport } from "./five-north-capability-bootstrap-transport.js";
import {
  recoverFiveNorthLiveCapabilityBootstrap,
  startFiveNorthLiveCapabilityBootstrap,
} from "./five-north-live-capability-bootstrap.js";

const workspaceRoot = resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);
const mode = process.argv[2];
if (mode !== "start" && mode !== "recover") {
  throw new Error("capability bootstrap mode must be start or recover");
}
const sourceCommit = await readCleanSourceCheckpoint(workspaceRoot);
loadEnvFile(resolve(workspaceRoot, ".env.local"));
const config = readSpikeConfig(process.env);
const scope = new AbortController();
const transport = createFiveNorthCapabilityBootstrapTransport(
  config.network,
  config.payer.party,
  { signal: scope.signal },
);

try {
  const result =
    mode === "start"
      ? await startFiveNorthLiveCapabilityBootstrap({
          agentParty: config.policy.agentParty,
          payerParty: config.payer.party,
          providerParty: config.provider.party,
          resourceUrl: config.provider.resourceUrl,
          sourceCommit,
          transport,
          workspaceRoot,
        })
      : await recoverFiveNorthLiveCapabilityBootstrap({
          networkCallCounts: transport.networkCallCounts,
          readActiveCapabilities: transport.readActiveCapabilities,
          readCompletionPage: transport.readCompletionPage,
          readLedgerEndOffset: transport.readLedgerEndOffset,
          sourceCommit,
          workspaceRoot,
        });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  scope.abort();
}
