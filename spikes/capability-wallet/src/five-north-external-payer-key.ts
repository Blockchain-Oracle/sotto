import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, open, realpath, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { OfflineSDKInterface } from "@canton-network/wallet-sdk";
import { readReferenceWalletPrivateKey } from "./reference-wallet-key.js";

const PRIVATE_KEY_BYTES = 64;
const WRITE_FLAGS =
  constants.O_WRONLY |
  constants.O_CREAT |
  constants.O_EXCL |
  constants.O_NOFOLLOW;

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

async function requireWalletDirectory(path: string): Promise<string> {
  const directory = dirname(resolve(path));
  if ((await realpath(directory)) !== directory) {
    throw new Error("external payer key directory must not be symbolic");
  }
  const status = await lstat(directory);
  if (
    !status.isDirectory() ||
    (status.mode & 0o777) !== 0o700 ||
    (typeof process.getuid === "function" && status.uid !== process.getuid())
  ) {
    throw new Error("external payer key directory must be owner-only");
  }
  return directory;
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(
    directory,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function removeTemporary(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
}

async function publishPrivateKey(path: string, key: Buffer): Promise<void> {
  const directory = await requireWalletDirectory(path);
  const temporary = join(
    directory,
    `.${process.pid}-${randomUUID()}.payer-key.tmp`,
  );
  try {
    const handle = await open(temporary, WRITE_FLAGS, 0o600);
    try {
      await handle.writeFile(key);
      await handle.chmod(0o600);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(temporary, resolve(path));
    await unlink(temporary);
    await syncDirectory(directory);
  } finally {
    await removeTemporary(temporary);
  }
}

export async function loadOrCreateExternalPayerPrivateKey(
  path: string,
  sdk: OfflineSDKInterface,
): Promise<Buffer> {
  const resolved = resolve(path);
  if (resolved !== path) {
    throw new Error("external payer key path must be absolute");
  }
  try {
    return await readReferenceWalletPrivateKey(resolved);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
  const generated = sdk.keys.generate();
  const key = Buffer.from(generated.privateKey, "base64");
  if (key.length !== PRIVATE_KEY_BYTES) {
    key.fill(0);
    throw new Error("external payer generated key is invalid");
  }
  try {
    await publishPrivateKey(resolved, key);
    return key;
  } catch (error) {
    key.fill(0);
    if (errorCode(error) === "EEXIST") {
      return readReferenceWalletPrivateKey(resolved);
    }
    throw error;
  }
}
