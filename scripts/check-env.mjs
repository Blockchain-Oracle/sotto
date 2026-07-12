import { readFileSync } from "node:fs";

const required = [
  "CANTON_EXPLORER_BASE_URL",
  "FIVE_NORTH_LEDGER_URL",
  "FIVE_NORTH_OIDC_CLIENT_ID",
  "FIVE_NORTH_OIDC_CLIENT_SECRET",
  "FIVE_NORTH_OIDC_ISSUER_URL",
  "PAID_PROVIDER_URL",
  "PAYER_PARTY",
  "PAYER_SIGNER_URL",
  "X402_RELAY_URL",
];
const entries = readFileSync(".env.example", "utf8")
  .split("\n")
  .filter((line) => line !== "" && !line.startsWith("#"));

const names = [];
for (const line of entries) {
  const [name, value, ...extra] = line.split("=");
  if (!name || value !== "" || extra.length > 0) {
    throw new Error(`Environment examples must be empty: ${line}`);
  }
  names.push(name);
}
if (new Set(names).size !== names.length)
  throw new Error("Duplicate environment name");
if (
  required.some((name) => !names.includes(name)) ||
  names.length !== required.length
) {
  throw new Error("Environment example does not match the spike boundary");
}
process.stdout.write("environment boundary verified\n");
