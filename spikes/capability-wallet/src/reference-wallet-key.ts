import { constants } from "node:fs";
import { open } from "node:fs/promises";

const PRIVATE_KEY_BYTES = 64;

function currentOwner(uid: number): void {
  if (typeof process.getuid === "function" && uid !== process.getuid()) {
    throw new Error("reference wallet key must be owned by the wallet user");
  }
}

export async function readReferenceWalletPrivateKey(
  path: string,
): Promise<Buffer> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const status = await handle.stat();
    currentOwner(status.uid);
    if (
      !status.isFile() ||
      status.nlink !== 1 ||
      (status.mode & 0o777) !== 0o600 ||
      status.size !== PRIVATE_KEY_BYTES
    ) {
      throw new Error("reference wallet key file is not owner-only");
    }
    const key = Buffer.alloc(PRIVATE_KEY_BYTES);
    try {
      let offset = 0;
      while (offset < key.length) {
        const { bytesRead } = await handle.read(
          key,
          offset,
          key.length - offset,
          offset,
        );
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      if (offset !== key.length) {
        throw new Error("reference wallet key file is incomplete");
      }
      return key;
    } catch (error) {
      key.fill(0);
      throw error;
    }
  } finally {
    await handle.close();
  }
}

export async function withReferenceWalletPrivateKey<T>(
  path: string,
  use: (key: Buffer) => T | Promise<T>,
): Promise<T> {
  const key = await readReferenceWalletPrivateKey(path);
  try {
    return await use(key);
  } finally {
    key.fill(0);
  }
}
