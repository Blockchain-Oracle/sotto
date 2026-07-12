import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter((file) => /\.(?:daml|js|mjs|ts|tsx)$/.test(file));

const failures = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n").length;
  if (lines > 300) failures.push(`${file}: ${lines} lines`);
  else if (lines > 200)
    process.stderr.write(`warning: ${file}: ${lines} lines\n`);
}

if (failures.length > 0) {
  throw new Error(`Source file limit exceeded:\n${failures.join("\n")}`);
}
process.stdout.write(`file length verified for ${files.length} source files\n`);
