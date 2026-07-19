import { constants } from "node:fs";
import { link, open, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { MAX_WALLET_HANDOFF_JSON_BYTES } from "./wallet-handoff-json.js";
import {
  requireWalletHandoffRoot,
  syncWalletHandoffDirectory,
} from "./wallet-handoff-path.js";

const WRITE_FLAGS =
  constants.O_WRONLY |
  constants.O_CREAT |
  constants.O_EXCL |
  constants.O_NOFOLLOW;
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

export class InvalidWalletHandoffArtifactError extends Error {}

function invalidArtifact(message: string): InvalidWalletHandoffArtifactError {
  return new InvalidWalletHandoffArtifactError(message);
}

function requireCurrentOwner(uid: number): void {
  if (typeof process.getuid === "function" && uid !== process.getuid()) {
    throw invalidArtifact(
      "wallet handoff artifact must be owned by the wallet user",
    );
  }
}

export async function readWalletHandoffBytes(
  path: string,
): Promise<Uint8Array> {
  const handle = await open(path, READ_FLAGS);
  try {
    const status = await handle.stat();
    if (!status.isFile())
      throw invalidArtifact("wallet handoff artifact is not a file");
    requireCurrentOwner(status.uid);
    if (status.nlink !== 1) {
      throw invalidArtifact(
        "wallet handoff artifact must have exactly one link",
      );
    }
    if ((status.mode & 0o777) !== 0o600) {
      throw invalidArtifact("wallet handoff artifact must use mode 0600");
    }
    if (status.size > MAX_WALLET_HANDOFF_JSON_BYTES) {
      throw invalidArtifact("wallet handoff JSON is too large");
    }
    const buffer = new Uint8Array(MAX_WALLET_HANDOFF_JSON_BYTES + 1);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const result = await handle.read(
        buffer,
        offset,
        buffer.byteLength - offset,
        offset,
      );
      if (result.bytesRead === 0) break;
      offset += result.bytesRead;
    }
    if (offset > MAX_WALLET_HANDOFF_JSON_BYTES) {
      throw invalidArtifact("wallet handoff JSON is too large");
    }
    return buffer.slice(0, offset);
  } finally {
    await handle.close();
  }
}

export async function removeWalletHandoffPath(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
}

export async function publishWalletHandoffBytes(
  root: string,
  target: string,
  bytes: Uint8Array,
): Promise<void> {
  await requireWalletHandoffRoot(root);
  const temporary = join(root, `.tmp-${process.pid}-${randomUUID()}`);
  try {
    const handle = await open(temporary, WRITE_FLAGS, 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.chmod(0o600);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(temporary, target);
    } catch (error) {
      if (errorCode(error) === "EEXIST") {
        throw new Error("wallet handoff artifact already exists or was used", {
          cause: error,
        });
      }
      throw error;
    }
    await syncWalletHandoffDirectory(root);
  } finally {
    await removeWalletHandoffPath(temporary);
  }
}
