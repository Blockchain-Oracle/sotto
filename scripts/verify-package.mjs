/**
 * Packed-artifact gate for publishable packages. Run from the package
 * directory (pnpm build wires it in). Asserts:
 *   - dual ESM + CJS entry points exist and load;
 *   - the declared bin file exists, is executable-shaped (shebang), and
 *     reports the package.json version;
 *   - `npm pack --dry-run` ships dist (and only intended files).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const packageDirectory = process.cwd();
const manifest = JSON.parse(
  readFileSync(join(packageDirectory, "package.json"), "utf8"),
);
const require = createRequire(import.meta.url);

function fail(message) {
  throw new Error(`${manifest.name}: ${message}`);
}

const esmEntry = resolve(packageDirectory, manifest.module ?? "dist/index.js");
const cjsEntry = resolve(packageDirectory, manifest.main ?? "dist/index.cjs");
const esm = await import(pathToFileURL(esmEntry).href);
const cjs = require(cjsEntry);
for (const [label, candidate] of [
  ["esm", esm],
  ["cjs", cjs],
]) {
  if (Object.keys(candidate).length === 0) {
    fail(`the packaged ${label} entry exports nothing`);
  }
}
if (manifest.name === "@usesotto/cli") {
  for (const candidate of [esm, cjs]) {
    if (typeof candidate.run !== "function") fail("run() export missing");
    if (candidate.CLI_VERSION !== manifest.version) {
      fail(
        `CLI_VERSION ${candidate.CLI_VERSION} != package version ${manifest.version}`,
      );
    }
    if (!Array.isArray(candidate.TOOL_DEFINITIONS)) {
      fail("TOOL_DEFINITIONS export missing");
    }
  }
}
if (manifest.name === "@sotto/purchase-client") {
  for (const candidate of [esm, cjs]) {
    if (typeof candidate.createSottoClient !== "function") {
      fail("createSottoClient export missing");
    }
  }
}

for (const [, binPath] of Object.entries(manifest.bin ?? {})) {
  const source = readFileSync(resolve(packageDirectory, binPath), "utf8");
  if (!source.startsWith("#!/usr/bin/env node")) {
    fail(`bin ${binPath} lacks the node shebang`);
  }
}

const packed = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: packageDirectory,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  }),
);
const files = packed[0]?.files?.map((file) => file.path) ?? [];
if (!files.includes("package.json")) fail("pack omits package.json");
if (!files.some((file) => file.startsWith("dist/"))) {
  fail("pack ships no dist/ output");
}
const stray = files.filter(
  (file) =>
    !file.startsWith("dist/") &&
    !["package.json", "README.md", "LICENSE"].includes(file),
);
if (stray.length > 0) fail(`pack ships unexpected files: ${stray.join(", ")}`);

process.stdout.write(
  `${manifest.name}@${manifest.version} packaged surface verified ` +
    `(${files.length} files)\n`,
);
