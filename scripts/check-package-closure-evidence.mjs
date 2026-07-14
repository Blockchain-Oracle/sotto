import { lstatSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const [artifact, ...extraArguments] = process.argv.slice(2);
if (artifact === undefined || extraArguments.length !== 0) {
  throw new Error("Usage: check-package-closure-evidence.mjs <artifact>");
}

const expectedRoot = resolve(".thoughts/research");
const artifactPath = resolve(artifact);
const relativePath = relative(expectedRoot, artifactPath);
if (
  relativePath !== "2026-07-14-bounded-purchase-package-closure.md" ||
  relativePath.startsWith("..")
) {
  throw new Error("Unexpected package-closure evidence path");
}

const metadata = lstatSync(artifactPath);
if (!metadata.isFile() || metadata.isSymbolicLink()) {
  throw new Error("Package-closure evidence must be a regular file");
}
if (metadata.size < 1 || metadata.size > 65_536) {
  throw new Error("Package-closure evidence exceeds its byte boundary");
}

const evidence = readFileSync(artifactPath, "utf8");
for (const required of [
  "# Reality Research: Bounded Purchase Package Closure",
  "## Sources Checked",
  "## Verified Facts",
  "## Inferences",
  "## Unknowns And Questions",
  "## Not Included",
  "d2ab4caaf31e93a7e482a827f8acaf65dc6e35a1",
  "fd93f86ac42ce3a08985dcd0baae530b4f235f60",
  "fd5b422530e9b4cd72ce78918144bb0a96099700523c8cbef8e257e4706275f8",
  "187b5122b1d9ff015a266bf28072f8371d2071b777ae49331c32e098d298fb76",
  "c26e1a4064afc9329167f90ad6f7e6f7236bc395fe480d1f113adc4e0168124c",
  "4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57",
  "58 package IDs, 48 names",
  "`sotto-control` plus `splice-amulet`",
  "NOT PROVEN",
  "performed no preparation, signing, faucet request",
  "No environment value, token, Party ID",
]) {
  if (!evidence.includes(required)) {
    throw new Error(`Package-closure evidence omits marker: ${required}`);
  }
}

for (const prohibited of [
  /FIVE_NORTH_OIDC_CLIENT_SECRET\s*=/u,
  /Authorization:\s*Bearer\s+/iu,
  /"access_token"\s*:/u,
  /BEGIN (?:EC |RSA )?PRIVATE KEY/u,
  /[a-f0-9]{32}::1220[a-f0-9]{64}/u,
]) {
  if (prohibited.test(evidence)) {
    throw new Error("Package-closure evidence contains prohibited material");
  }
}

process.stdout.write("package-closure evidence verified\n");
