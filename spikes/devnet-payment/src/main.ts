import { readSpikeConfig, summarizeConfig } from "./config.js";

try {
  const summary = summarizeConfig(readSpikeConfig(process.env));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Unknown configuration error";
  process.stderr.write(`DevNet spike preflight failed: ${message}\n`);
  process.exitCode = 1;
}
