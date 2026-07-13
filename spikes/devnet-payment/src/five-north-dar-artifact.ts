import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { mkdtemp, open, realpath, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { SOTTO_CONTROL_PACKAGE_ID } from "@sotto/x402-canton";
import { readCleanSourceCheckpoint } from "./clean-source-checkpoint.js";
import { MAXIMUM_FIVE_NORTH_DAR_BYTES } from "./five-north-package-deployment-validation.js";
import { APPROVED_SOTTO_CONTROL_DAR_PACKAGES } from "./sotto-control-dar-inventory.js";

const execFileAsync = promisify(execFile);
const DAR_FILENAME = "sotto-control-0.2.0.dar";
const DAR_RELATIVE_PATH = `daml/sotto-control/.daml/dist/${DAR_FILENAME}`;
const MAXIMUM_INSPECTION_BYTES = 8_388_608;
const PINNED_DAML_SDK_VERSION = "3.5.2";
const PINNED_DPM_EXECUTABLE = join(
  homedir(),
  ".dpm/cache/components/dpm/1.0.21/dpm",
);
const PACKAGE_ID_PATTERN = /^[0-9a-f]{64}$/u;
const approvedPackages: ReadonlyMap<
  string,
  Readonly<{ name: string; version: string }>
> = new Map(
  APPROVED_SOTTO_CONTROL_DAR_PACKAGES.map(([id, name, version]) => [
    id,
    { name, version },
  ]),
);

type Execute = (
  command: string,
  arguments_: readonly string[],
) => Promise<string>;
type ExecuteGit = (arguments_: readonly string[]) => Promise<string>;

declare const darBrand: unique symbol;
export type VerifiedSottoControlDar = Readonly<{
  darByteLength: number;
  darSha256: `sha256:${string}`;
  packageId: typeof SOTTO_CONTROL_PACKAGE_ID;
  sourceCommit: string;
  readonly [darBrand]: true;
}>;

const bytesByArtifact = new WeakMap<object, Uint8Array>();

async function execute(
  command: string,
  arguments_: readonly string[],
): Promise<string> {
  if (command !== "dpm") throw new Error("only pinned DPM may inspect DARs");
  const executable = await realpath(PINNED_DPM_EXECUTABLE);
  const metadata = await stat(executable);
  const currentUid =
    typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (
    executable !== PINNED_DPM_EXECUTABLE ||
    !metadata.isFile() ||
    metadata.uid !== currentUid ||
    (metadata.mode & 0o022) !== 0
  ) {
    throw new Error("pinned DPM executable is not owner-controlled");
  }
  const result = await execFileAsync(executable, [...arguments_], {
    encoding: "utf8",
    maxBuffer: MAXIMUM_INSPECTION_BYTES,
  });
  return result.stdout;
}

function requirePinnedDamlSdk(output: string): void {
  if (output.trim() !== `* ${PINNED_DAML_SDK_VERSION}`) {
    throw new Error(
      `production DAR requires Daml SDK ${PINNED_DAML_SDK_VERSION}`,
    );
  }
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseInspection(output: string): void {
  if (Buffer.byteLength(output, "utf8") > MAXIMUM_INSPECTION_BYTES) {
    throw new Error("Daml DAR inspection exceeds byte limit");
  }
  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch {
    throw new Error("Daml DAR inspection is not valid JSON");
  }
  const root = objectValue(value, "Daml DAR inspection");
  if (root.main_package_id !== SOTTO_CONTROL_PACKAGE_ID) {
    throw new Error("Daml DAR main package ID is not approved");
  }
  const packages = objectValue(root.packages, "Daml DAR packages");
  const packageEntries = Object.entries(packages);
  if (packageEntries.length !== approvedPackages.size) {
    throw new Error("Daml DAR package inventory is not approved");
  }
  for (const [packageId, candidate] of packageEntries) {
    if (!PACKAGE_ID_PATTERN.test(packageId)) {
      throw new Error("Daml DAR package inventory contains an invalid ID");
    }
    const entry = objectValue(candidate, "Daml DAR package entry");
    const approved = approvedPackages.get(packageId);
    if (
      approved === undefined ||
      Object.keys(entry).sort().join(",") !== "name,path,version" ||
      entry.name !== approved.name ||
      entry.version !== approved.version ||
      typeof entry.path !== "string" ||
      entry.path === "" ||
      entry.path.includes("..") ||
      entry.path.startsWith("/")
    ) {
      throw new Error(
        "Daml DAR package inventory contains an unexpected package",
      );
    }
  }
  const main = objectValue(
    packages[SOTTO_CONTROL_PACKAGE_ID],
    "Daml DAR main package",
  );
  if (
    Object.keys(main).sort().join(",") !== "name,path,version" ||
    main.name !== "sotto-control" ||
    main.version !== "0.2.0" ||
    typeof main.path !== "string" ||
    !main.path.endsWith(`/sotto-control-0.2.0-${SOTTO_CONTROL_PACKAGE_ID}.dalf`)
  ) {
    throw new Error("Daml DAR main package tuple is not approved");
  }
}

export async function loadVerifiedSottoControlDar(
  input: Readonly<{
    executeDpm?: Execute;
    executeGit?: ExecuteGit;
    workspaceRoot: string;
  }>,
): Promise<VerifiedSottoControlDar> {
  if (!isAbsolute(input.workspaceRoot)) {
    throw new Error("production Sotto workspace root must be absolute");
  }
  const sourceCommit = await readCleanSourceCheckpoint(
    input.workspaceRoot,
    input.executeGit,
  );
  const workspaceRoot = await realpath(input.workspaceRoot);
  const darPath = resolve(workspaceRoot, DAR_RELATIVE_PATH);
  if (
    basename(darPath) !== DAR_FILENAME ||
    (await realpath(darPath)) !== darPath
  ) {
    throw new Error("production Sotto DAR path is invalid");
  }
  const handle = await open(darPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes: Uint8Array;
  try {
    const metadata = await handle.stat();
    if (
      !metadata.isFile() ||
      metadata.size < 1 ||
      metadata.size > MAXIMUM_FIVE_NORTH_DAR_BYTES
    ) {
      throw new Error("production Sotto DAR is empty or exceeds byte limit");
    }
    bytes = new Uint8Array(await handle.readFile());
    if (
      bytes.byteLength !== metadata.size ||
      bytes.byteLength > MAXIMUM_FIVE_NORTH_DAR_BYTES
    ) {
      throw new Error("production Sotto DAR changed during snapshot");
    }
  } finally {
    await handle.close();
  }
  const run = input.executeDpm ?? execute;
  requirePinnedDamlSdk(await run("dpm", ["version"]));
  const verificationDirectory = await mkdtemp(
    join(tmpdir(), "sotto-dar-verify-"),
  );
  const verificationPath = join(verificationDirectory, DAR_FILENAME);
  try {
    await writeFile(verificationPath, bytes, { mode: 0o600 });
    await run("dpm", ["validate-dar", verificationPath]);
    parseInspection(
      await run("dpm", ["damlc", "inspect-dar", verificationPath, "--json"]),
    );
  } finally {
    await rm(verificationDirectory, { force: true, recursive: true });
  }
  const confirmedCommit = await readCleanSourceCheckpoint(
    input.workspaceRoot,
    input.executeGit,
  );
  if (confirmedCommit !== sourceCommit) {
    throw new Error(
      "production Sotto source commit changed during verification",
    );
  }
  const artifact = Object.freeze({
    darByteLength: bytes.byteLength,
    darSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    packageId: SOTTO_CONTROL_PACKAGE_ID,
    sourceCommit,
  }) as VerifiedSottoControlDar;
  bytesByArtifact.set(artifact, bytes);
  return artifact;
}

export function verifiedSottoControlDarBytes(artifact: unknown): Uint8Array {
  if (typeof artifact !== "object" || artifact === null) {
    throw new Error("Sotto DAR artifact is not authenticated");
  }
  const bytes = bytesByArtifact.get(artifact);
  if (bytes === undefined) {
    throw new Error("Sotto DAR artifact is not authenticated");
  }
  return bytes.slice();
}
