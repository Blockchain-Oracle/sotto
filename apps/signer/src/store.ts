import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

const MAX_RECORD_BYTES = 262_144;
const CREATE_FLAGS =
  constants.O_WRONLY |
  constants.O_CREAT |
  constants.O_EXCL |
  constants.O_NOFOLLOW;
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;

export const RECORD_ID_PATTERN = /^[0-9a-f]{32}$/u;

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function requireCurrentOwner(uid: number, label: string): void {
  if (typeof process.getuid === "function" && uid !== process.getuid()) {
    throw new Error(`${label} must be owned by the signer user`);
  }
}

export async function ensureOwnerOnlyDirectory(path: string): Promise<string> {
  const directory = resolve(path);
  try {
    await mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if (errorCode(error) !== "EEXIST") throw error;
  }
  const status = await lstat(directory);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error("signer state directory must not be symbolic");
  }
  requireCurrentOwner(status.uid, "signer state directory");
  if ((status.mode & 0o777) !== 0o700) {
    throw new Error("signer state directory must use mode 0700");
  }
  return directory;
}

async function writeExclusive(path: string, bytes: Buffer): Promise<void> {
  const handle = await open(path, CREATE_FLAGS, 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.chmod(0o600);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function encodeRecord(value: unknown): Buffer {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  if (bytes.byteLength > MAX_RECORD_BYTES) {
    throw new Error("signer record is oversized");
  }
  return bytes;
}

/** Atomically writes or replaces a mutable owner-only JSON record (0600). */
export async function writeOwnerJson(
  directory: string,
  name: string,
  value: unknown,
): Promise<void> {
  const target = join(directory, name);
  const temporary = join(directory, `.tmp-${process.pid}-${randomUUID()}`);
  try {
    await writeExclusive(temporary, encodeRecord(value));
    await rename(temporary, target);
  } finally {
    // Best-effort cleanup: after a successful rename the temporary path is
    // already gone; any other leftover is removed without masking the result.
    await unlink(temporary).catch(() => undefined);
  }
}

/** Creates a one-use owner-only JSON record; fails if it already exists. */
export async function createOwnerJson(
  directory: string,
  name: string,
  value: unknown,
): Promise<boolean> {
  try {
    await writeExclusive(join(directory, name), encodeRecord(value));
    return true;
  } catch (error) {
    if (errorCode(error) === "EEXIST") return false;
    throw error;
  }
}

/** Reads an owner-only JSON record; returns undefined when absent. */
export async function readOwnerJson(
  directory: string,
  name: string,
): Promise<unknown> {
  let handle;
  try {
    handle = await open(join(directory, name), READ_FLAGS);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    throw error;
  }
  try {
    const status = await handle.stat();
    requireCurrentOwner(status.uid, "signer record");
    if (
      !status.isFile() ||
      (status.mode & 0o777) !== 0o600 ||
      status.size > MAX_RECORD_BYTES
    ) {
      throw new Error("signer record file is not owner-only");
    }
    const bytes = await handle.readFile();
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } finally {
    await handle.close();
  }
}

export async function removeOwnerJson(
  directory: string,
  name: string,
): Promise<boolean> {
  try {
    await unlink(join(directory, name));
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

export async function listOwnerJsonNames(
  directory: string,
): Promise<ReadonlyArray<string>> {
  const names = await readdir(directory);
  return names.filter((name) => name.endsWith(".json")).sort();
}
