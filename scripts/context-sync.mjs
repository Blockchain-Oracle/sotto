import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

const [mode, ...args] = process.argv.slice(2);
if (!new Set(["copy", "verify"]).has(mode)) {
  throw new Error(
    "Usage: context-sync.mjs <copy|verify> --source <archive-root>",
  );
}

const option = (name, fallback) => {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  if (!args[index + 1]) throw new Error(`Missing ${name} value`);
  return args[index + 1];
};

const sourceRoot = resolve(option("--source"));
const destinationRoot = resolve(option("--destination", process.cwd()));
const manifestPath = resolve(option("--manifest", "context/manifest.json"));
const strict = mode === "copy" || args.includes("--strict");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.version !== 1 || !Array.isArray(manifest.entries)) {
  throw new Error("Unsupported context manifest");
}

function inside(root, path) {
  const value = relative(root, path);
  return (
    value !== ".." &&
    !value.startsWith(`..${sep}`) &&
    !resolve(path).startsWith(`${root}${sep}..`)
  );
}

async function digest(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isFile())
    throw new Error(`Unsafe file: ${path}`);
  const value = await readFile(path);
  return {
    bytes: value.length,
    sha256: createHash("sha256").update(value).digest("hex"),
  };
}

async function listFiles(root, directory, files = []) {
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error.code === "ENOENT") return files;
    throw error;
  }
  for (const name of names.sort()) {
    const path = resolve(directory, name);
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`Symlink rejected: ${path}`);
    if (stat.isDirectory()) await listFiles(root, path, files);
    else if (stat.isFile())
      files.push(relative(root, path).split(sep).join("/"));
    else throw new Error(`Unsupported file: ${path}`);
  }
  return files;
}

const expected = new Set();
for (const entry of manifest.entries) {
  const source = resolve(sourceRoot, entry.source);
  const destination = resolve(destinationRoot, entry.destination);
  if (
    !entry.destination.startsWith(".thoughts/") ||
    !inside(sourceRoot, source) ||
    !inside(destinationRoot, destination)
  ) {
    throw new Error(`Path rejected: ${entry.destination}`);
  }
  const sourceDigest = await digest(source);
  if (
    sourceDigest.bytes !== entry.bytes ||
    sourceDigest.sha256 !== entry.sha256
  ) {
    throw new Error(`Source checksum mismatch: ${entry.source}`);
  }
  if (mode === "copy") {
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  const destinationDigest = await digest(destination);
  if (
    destinationDigest.bytes !== entry.bytes ||
    destinationDigest.sha256 !== entry.sha256
  ) {
    throw new Error(`Destination checksum mismatch: ${entry.destination}`);
  }
  expected.add(entry.destination.slice(".thoughts/".length));
}

const actual = new Set(
  await listFiles(
    resolve(destinationRoot, ".thoughts"),
    resolve(destinationRoot, ".thoughts"),
  ),
);
const extra = [...actual].filter((path) => !expected.has(path));
const missing = [...expected].filter((path) => !actual.has(path));
if (missing.length || (strict && extra.length)) {
  throw new Error(
    `Context set differs: ${extra.length} extra, ${missing.length} missing`,
  );
}
process.stdout.write(
  `${mode} verified ${manifest.entries.length} exact context files${extra.length ? `; ${extra.length} local files outside the imported manifest` : ""}\n`,
);
