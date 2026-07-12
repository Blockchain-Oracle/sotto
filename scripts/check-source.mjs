import { execFileSync } from "node:child_process";

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);

const prohibited = files.filter((file) => {
  if (file === ".env.example") return false;
  return (
    /(^|\/)(?:\.daml|\.dpm|\.thoughts|build|dist|node_modules|raw)(\/|$)/.test(
      file,
    ) ||
    /(?:\.dalf|\.dar|\.key|\.p12|\.pem|\.wallet)$/.test(file) ||
    /(^|\/)\.env(?:\.|$)/.test(file)
  );
});
if (prohibited.length > 0) {
  throw new Error(`Forbidden source artifacts:\n${prohibited.join("\n")}`);
}
process.stdout.write(`source artifact check passed: ${files.length} files\n`);
