import { execFileSync } from "node:child_process";

const pnpmScript = process.env.npm_execpath;
const command = pnpmScript === undefined ? "pnpm" : process.execPath;
const args = [
  ...(pnpmScript === undefined ? [] : [pnpmScript]),
  "licenses",
  "list",
  "--json",
];
const output = execFileSync(command, args, { encoding: "utf8" });
const licenses = Object.keys(JSON.parse(output));
const prohibited = licenses.filter((license) =>
  /(?:AGPL|BUSL|Commons Clause|GPL|SSPL|UNLICENSED|UNKNOWN)/i.test(license),
);
if (prohibited.length > 0) {
  throw new Error(`Prohibited dependency licenses: ${prohibited.join(", ")}`);
}
process.stdout.write(`dependency licenses verified: ${licenses.join(", ")}\n`);
