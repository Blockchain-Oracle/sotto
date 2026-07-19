import { loadEnvFile } from "node:process";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readCleanSourceCheckpoint } from "./clean-source-checkpoint.js";
import { readSpikeConfig } from "./config.js";
import { runFiveNorthWalletPreflight } from "./five-north-wallet-preflight-runner.js";
import { createFiveNorthWalletPreflightTransport } from "./five-north-wallet-preflight-transport.js";

const workspaceRoot = resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);
const sourceCommit = await readCleanSourceCheckpoint(workspaceRoot);
loadEnvFile(resolve(workspaceRoot, ".env.local"));
const config = readSpikeConfig(process.env);
const controller = new AbortController();

try {
  const output = await runFiveNorthWalletPreflight({
    agentParty: config.policy.agentParty,
    collect: createFiveNorthWalletPreflightTransport(config.network, {
      signal: controller.signal,
    }),
    payerParty: config.payer.party,
    sourceCommit,
    workspaceRoot,
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        checks: output.result.checks,
        reasons: output.result.reasons,
        report: relative(workspaceRoot, output.reportPath),
        subjectHash: output.result.subjectHash,
        verdict: output.result.verdict,
        version: output.result.version,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  controller.abort();
}
