import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { mkdir } from "node:fs/promises";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1]) throw new Error(`Missing ${name}`);
  return args[index + 1];
};

const sourceRoot = resolve(option("--source"));
const output = resolve(option("--output"));
const consumed = new Set([
  args.indexOf("--source"),
  args.indexOf("--source") + 1,
  args.indexOf("--output"),
  args.indexOf("--output") + 1,
]);
const requested = args.filter((_, index) => !consumed.has(index));
if (requested.length === 0) throw new Error("Provide approved source paths");

const forbiddenParts = new Set([
  ".git", "node_modules", "dist", "build", ".next", "coverage", "raw",
  ".playwright-mcp", "playwright-report", "test-results",
]);
const forbiddenNames = /(^|\/)(\.env($|\.)|wallet\.json$|.*\.(pem|key|p12|dar|dalf)$)/i;

function safeRelative(absolute) {
  const value = relative(sourceRoot, absolute);
  if (!value || value.startsWith(`..${sep}`) || value === "..") {
    throw new Error(`Path escapes source root: ${absolute}`);
  }
  return value.split(sep).join("/");
}

function forbidden(path) {
  const parts = path.split("/");
  return parts.some((part) => forbiddenParts.has(part)) || forbiddenNames.test(path);
}

async function hashFile(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function walk(absolute, entries) {
  const stat = await lstat(absolute);
  const path = safeRelative(absolute);
  if (stat.isSymbolicLink()) throw new Error(`Symlink rejected: ${path}`);
  if (forbidden(path)) return;
  if (stat.isDirectory()) {
    for (const name of (await readdir(absolute)).sort()) {
      await walk(resolve(absolute, name), entries);
    }
    return;
  }
  if (!stat.isFile()) throw new Error(`Unsupported file type: ${path}`);
  const digest = await hashFile(absolute);
  entries.push({ source: path, destination: path, ...digest });
}

const entries = [];
for (const item of requested) await walk(resolve(sourceRoot, item), entries);
entries.sort((a, b) => a.destination.localeCompare(b.destination));

const destinations = new Set();
for (const entry of entries) {
  if (!entry.destination.startsWith(".thoughts/")) {
    throw new Error(`Private destination must be under .thoughts: ${entry.destination}`);
  }
  if (destinations.has(entry.destination)) throw new Error(`Duplicate: ${entry.destination}`);
  destinations.add(entry.destination);
}

const manifest = {
  version: 1,
  sourceWorkspace: "sotto-payroll-archive",
  archiveCommit: "c29e4da31e37b90385aa875b70928364b4251193",
  entries,
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Wrote ${entries.length} exact context entries to ${output}\n`);
