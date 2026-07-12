import { readFileSync } from "node:fs";

const readme = readFileSync("README.md", "utf8");
const normalized = readme.replace(/\s+/g, " ");
for (const required of [
  "does not yet contain a shipping marketplace",
  "No mocked payment or fixture transaction can satisfy those gates.",
  "https://github.com/Blockchain-Oracle/sotto-payroll-archive",
]) {
  if (!normalized.includes(required))
    throw new Error(`README omits status: ${required}`);
}
for (const prohibited of [
  /production[- ]ready/i,
  /Canton x402 facilitator is live/i,
  /ledger-enforced spending limits are implemented/i,
]) {
  if (prohibited.test(readme))
    throw new Error(`Unverified README claim: ${prohibited}`);
}
process.stdout.write("public claims match implemented status\n");
