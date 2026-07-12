import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("context/manifest.json", "utf8"));
if (manifest.version !== 1 || !Array.isArray(manifest.entries)) {
  throw new Error("Unsupported context manifest");
}

const destinations = manifest.entries.map((entry) => entry.destination);
if (new Set(destinations).size !== destinations.length) {
  throw new Error("Context manifest contains duplicate destinations");
}
for (const entry of manifest.entries) {
  if (
    typeof entry.source !== "string" ||
    typeof entry.destination !== "string" ||
    !entry.destination.startsWith(".thoughts/") ||
    !Number.isInteger(entry.bytes) ||
    entry.bytes < 1 ||
    !/^[a-f0-9]{64}$/.test(entry.sha256)
  ) {
    throw new Error(`Invalid context entry: ${JSON.stringify(entry)}`);
  }
}

const trackedPrivate = execFileSync("git", ["ls-files", ".thoughts"], {
  encoding: "utf8",
}).trim();
if (trackedPrivate !== "")
  throw new Error("Private .thoughts files are tracked");

const router = readFileSync("AGENTS.md", "utf8");
for (const authority of [
  "docs/product/product-contract.md",
  "docs/product/decision-summary.md",
  "docs/architecture/devnet-spike-plan.md",
  "docs/quality/quality-contract.md",
]) {
  if (!router.includes(authority)) throw new Error(`Router omits ${authority}`);
}
process.stdout.write(
  `context manifest verified: ${manifest.entries.length} entries\n`,
);
