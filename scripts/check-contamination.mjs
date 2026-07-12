import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const roots = ["daml", "packages", "spikes"];
const extensions = new Set([".daml", ".js", ".json", ".mjs", ".ts", ".yaml"]);
const prohibited = [
  /payroll/i,
  /payslip/i,
  /employee/i,
  /auditor/i,
  /email[ _-]?otp/i,
  /showcase/i,
  /sample\.sotto/i,
  /sendMoney/,
  /SHOWCASE_/,
];

function files(directory, result = []) {
  for (const name of readdirSync(directory)) {
    if ([".daml", "dist", "node_modules"].includes(name)) continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) files(path, result);
    else if (extensions.has(extname(path))) result.push(path);
  }
  return result;
}

const findings = [];
for (const file of roots.flatMap((root) => files(root))) {
  const contents = readFileSync(file, "utf8");
  for (const pattern of prohibited) {
    if (pattern.test(contents)) findings.push(`${file}: ${pattern}`);
  }
}

if (findings.length > 0) {
  throw new Error(`Product contamination found:\n${findings.join("\n")}`);
}
process.stdout.write("runtime contamination check passed\n");
