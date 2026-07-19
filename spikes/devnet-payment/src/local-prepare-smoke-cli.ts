import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { recomputeWalletPreparedHashPrecheck } from "@sotto/x402-canton";
import { persistLocalPrepareArtifact } from "./local-prepare-artifact.js";
import { runLocalPrepareSmoke } from "./local-prepare-smoke.js";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const bootstrapPath = resolve(
  workspaceRoot,
  process.argv[2] ?? "tmp/prepare-sandbox/bootstrap.json",
);
const rawOutputPath =
  process.argv[3] ?? "tmp/prepare-sandbox/prepare-response.json";
const baseUrl = process.argv[4] ?? "http://127.0.0.1:7575";

const bootstrap = JSON.parse(await readFile(bootstrapPath, "utf8")) as unknown;
const result = await runLocalPrepareSmoke({
  baseUrl,
  bootstrap,
  fetcher: fetch,
  persistRaw: (bytes) =>
    persistLocalPrepareArtifact(workspaceRoot, rawOutputPath, bytes),
  recomputePrecheck: recomputeWalletPreparedHashPrecheck,
});

process.stdout.write(`${JSON.stringify(result)}\n`);
