import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const MAX_DAR_BYTES = 3 * 1024 * 1024;
const MAX_INSPECTION_BYTES = 1024 * 1024;
const DPM = join(homedir(), ".dpm/cache/components/dpm/1.0.21/dpm");
const SOTTO_DAR = resolve(
  "daml/sotto-control/.daml/dist/sotto-control-0.2.0.dar",
);
const UNION_SHA256 =
  "94d17e6ef7bf3de3b6d27ae7c889625250ecb1395784ea344dfbde662b86e6bc";
const HEX_64 = /^[a-f0-9]{64}$/u;
const SAFE_METADATA = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/u;

const SPLICE_ARTIFACTS = Object.freeze([
  {
    version: "0.1.9",
    filename: "splice-amulet-0.1.9.dar",
    darSha256:
      "fd5b422530e9b4cd72ce78918144bb0a96099700523c8cbef8e257e4706275f8",
    mainPackageId:
      "a5b055492fb8f08b2e7bc0fc94da6da50c39c2e1d7f24cd5ea8db12fc87c1332",
    manifestSha256:
      "d741194e76c085e9abf2357940911a7149bc21d59334a10475ecbfccc76062b5",
  },
  {
    version: "0.1.20",
    filename: "splice-amulet-0.1.20.dar",
    darSha256:
      "187b5122b1d9ff015a266bf28072f8371d2071b777ae49331c32e098d298fb76",
    mainPackageId:
      "23f47481dab6b1ec01339d6e14494d85bb2844c25f45b26fc5c9ef4cd4942d1f",
    manifestSha256:
      "8cf9ea495e87b7df3adc24d0b7c60aca9bbcc5bb26112adc482c14d58eecba74",
  },
  {
    version: "0.1.21",
    filename: "splice-amulet-0.1.21.dar",
    darSha256:
      "c26e1a4064afc9329167f90ad6f7e6f7236bc395fe480d1f113adc4e0168124c",
    mainPackageId:
      "73e9ffdb6b0bc19a5f67372b118103926da11547ab9109eccae47e4e4cc35d6f",
    manifestSha256:
      "3eddea21637148fc248ac07736d70a79f43838bdc6be6d910dcccca4d4a7e87c",
  },
]);

const fail = (message) => {
  throw new Error(message);
};

function metadataFor(path, label, expectedKind = "file") {
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch {
    fail(`${label} is unavailable`);
  }
  if (metadata.isSymbolicLink()) {
    fail(`${label} must not be a symbolic link`);
  }
  if (
    expectedKind === "directory" ? !metadata.isDirectory() : !metadata.isFile()
  ) {
    fail(`${label} must be a regular ${expectedKind}`);
  }
  return metadata;
}

function verifyDpm() {
  const metadata = metadataFor(DPM, "pinned DPM executable");
  const currentUid = process.getuid?.();
  if (
    currentUid === undefined ||
    realpathSync(DPM) !== DPM ||
    metadata.uid !== currentUid ||
    (metadata.mode & 0o022) !== 0 ||
    (metadata.mode & 0o100) === 0
  ) {
    fail("pinned DPM executable is not owner-controlled");
  }
  const version = runDpm(["--version"], 4096);
  if (!version.startsWith("version: 1.0.21\n")) {
    fail("pinned DPM version is unexpected");
  }
  const sdkVersion = runDpm(["version", "--active"], 4096).trim();
  if (sdkVersion !== "3.5.2") {
    fail("Daml SDK 3.5.2 is required");
  }
}

function runDpm(arguments_, maxBytes) {
  const result = spawnSync(DPM, arguments_, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      HOME: homedir(),
      LANG: "C.UTF-8",
      PATH: "/usr/bin:/bin",
      TMPDIR: process.env.TMPDIR ?? "/tmp",
    },
    timeout: 30_000,
    maxBuffer: maxBytes,
    shell: false,
  });
  if (
    result.error !== undefined ||
    result.signal !== null ||
    result.status !== 0 ||
    typeof result.stdout !== "string" ||
    Buffer.byteLength(result.stdout, "utf8") > maxBytes ||
    typeof result.stderr !== "string" ||
    Buffer.byteLength(result.stderr, "utf8") > maxBytes
  ) {
    fail("pinned DPM command failed within its output boundary");
  }
  return result.stdout;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function hasControlCharacter(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}

function compareManifestEntries(left, right) {
  return (
    compareUtf8(left.name, right.name) ||
    compareUtf8(left.version, right.version) ||
    compareUtf8(left.packageId, right.packageId)
  );
}

function parseInspection(raw, label, expectedMainPackageId) {
  let inspection;
  try {
    inspection = JSON.parse(raw);
  } catch {
    fail(`${label} inspection is not valid JSON`);
  }
  if (
    inspection === null ||
    typeof inspection !== "object" ||
    Array.isArray(inspection) ||
    Object.keys(inspection).sort().join(",") !==
      "files,main_package_id,packages" ||
    inspection.main_package_id !== expectedMainPackageId ||
    inspection.packages === null ||
    typeof inspection.packages !== "object" ||
    Array.isArray(inspection.packages)
  ) {
    fail(`${label} inspection has unexpected package metadata`);
  }
  const records = Object.entries(inspection.packages);
  if (records.length < 1 || records.length > 256) {
    fail(`${label} inspection has an invalid package count`);
  }
  return records.map(([packageId, value]) => {
    if (
      !HEX_64.test(packageId) ||
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== "name,path,version" ||
      !SAFE_METADATA.test(value.name) ||
      !SAFE_METADATA.test(value.version) ||
      typeof value.path !== "string" ||
      value.path.length < 1 ||
      value.path.length > 1024 ||
      hasControlCharacter(value.path) ||
      value.path.startsWith("/") ||
      value.path.includes("..")
    ) {
      fail(`${label} inspection contains malformed package metadata`);
    }
    return { packageId, name: value.name, version: value.version };
  });
}

function inspectDar(path, label, expectedMainPackageId) {
  const metadata = metadataFor(path, label);
  if (metadata.size < 1 || metadata.size > MAX_DAR_BYTES) {
    fail(`${label} exceeds its byte boundary`);
  }
  runDpm(["validate-dar", path], 65_536);
  return parseInspection(
    runDpm(["inspect-dar", path, "--json"], MAX_INSPECTION_BYTES),
    label,
    expectedMainPackageId,
  );
}

function manifestBytes(entries) {
  return Buffer.from(
    entries
      .toSorted(compareManifestEntries)
      .map(
        ({ name, version, packageId }) => `${name}\t${version}\t${packageId}\n`,
      )
      .join(""),
    "utf8",
  );
}

function buildUnion(manifests) {
  const packages = new Map();
  for (const entry of manifests.flat()) {
    const recorded = packages.get(entry.packageId);
    if (
      recorded !== undefined &&
      (recorded.name !== entry.name || recorded.version !== entry.version)
    ) {
      fail("package union contains conflicting ID metadata");
    }
    packages.set(entry.packageId, entry);
  }
  const entries = [...packages.values()].toSorted((left, right) =>
    compareUtf8(left.packageId, right.packageId),
  );
  if (
    entries.length !== 58 ||
    new Set(entries.map(({ name }) => name)).size !== 48
  ) {
    fail("package union has unexpected package or name counts");
  }
  const bytes = Buffer.from(
    entries
      .map(
        ({ packageId, name, version }) => `${packageId}\t${name}\t${version}\n`,
      )
      .join(""),
    "utf8",
  );
  if (sha256(bytes) !== UNION_SHA256) {
    fail("package union hash is unexpected");
  }
  return entries;
}

function main() {
  const [directory, ...extraArguments] = process.argv.slice(2);
  if (directory === undefined || extraArguments.length !== 0) {
    fail("Usage: check-splice-amulet-dar-inventory.mjs <directory>");
  }
  const root = resolve(directory);
  metadataFor(root, "artifact directory", "directory");
  verifyDpm();

  const manifests = [];
  for (const artifact of SPLICE_ARTIFACTS) {
    const path = join(root, artifact.filename);
    const metadata = metadataFor(path, artifact.filename);
    if (metadata.size < 1 || metadata.size > MAX_DAR_BYTES)
      fail(`${artifact.filename} exceeds its byte boundary`);
    if (sha256(readFileSync(path)) !== artifact.darSha256) {
      fail(`${artifact.filename} SHA-256 is unexpected`);
    }
    const entries = inspectDar(path, artifact.filename, artifact.mainPackageId);
    if (sha256(manifestBytes(entries)) !== artifact.manifestSha256) {
      fail(`${artifact.filename} manifest hash is unexpected`);
    }
    manifests.push(entries);
    process.stdout.write(
      `${artifact.filename}: packages=${entries.length} manifest=${artifact.manifestSha256}\n`,
    );
  }
  const sottoEntries = inspectDar(
    SOTTO_DAR,
    basename(SOTTO_DAR),
    "4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57",
  );
  if (sottoEntries.length !== 35) {
    fail("sotto-control-0.2.0.dar has an unexpected package count");
  }
  const union = buildUnion([...manifests, sottoEntries]);
  process.stdout.write(
    `package-union: packages=${union.length} names=48 manifest=${UNION_SHA256}\n`,
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown failure";
  process.stderr.write(`package inventory verification failed: ${message}\n`);
  process.exitCode = 1;
}
