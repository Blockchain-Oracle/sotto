import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  InvalidWalletHandoffArtifactError,
  removeWalletHandoffPath,
} from "./wallet-handoff-files.js";
import { syncWalletHandoffDirectory } from "./wallet-handoff-path.js";
import {
  requireWalletHandoffTime,
  WALLET_HANDOFF_FILE_PATTERN,
} from "./wallet-handoff-types.js";
import { walletHandoffTemporaryStatus } from "./wallet-handoff-temporary.js";
import {
  isExpiredWalletHandoffTombstone,
  isWalletHandoffTombstone,
} from "./wallet-handoff-tombstone.js";

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

export async function cleanupExpiredWalletHandoffArtifacts(input: {
  now: () => number;
  readExpiration: (id: string, kind: string) => Promise<string>;
  root: string;
}): Promise<string[]> {
  const deleted: string[] = [];
  const entries = (await readdir(input.root, { withFileTypes: true })).sort(
    (left, right) => utf8Compare(left.name, right.name),
  );
  for (const entry of entries) {
    const path = join(input.root, entry.name);
    if (entry.isSymbolicLink()) {
      await removeWalletHandoffPath(path);
      deleted.push(entry.name);
      continue;
    }
    if (!entry.isFile()) continue;
    const temporary = walletHandoffTemporaryStatus(entry.name);
    if (temporary !== undefined) {
      if (temporary === "abandoned") {
        await removeWalletHandoffPath(path);
        deleted.push(entry.name);
      }
      continue;
    }
    if (isWalletHandoffTombstone(entry.name)) {
      if (await isExpiredWalletHandoffTombstone(path, input.now())) {
        await removeWalletHandoffPath(path);
        deleted.push(entry.name);
      }
      continue;
    }
    const match = WALLET_HANDOFF_FILE_PATTERN.exec(entry.name);
    if (match === null) continue;
    let expiresAt: string;
    try {
      expiresAt = await input.readExpiration(match[1]!, match[2]!);
    } catch (error) {
      if (errorCode(error) === "ENOENT") continue;
      if (!(error instanceof InvalidWalletHandoffArtifactError)) throw error;
      await removeWalletHandoffPath(path);
      deleted.push(entry.name);
      continue;
    }
    if (requireWalletHandoffTime(expiresAt) <= input.now()) {
      await removeWalletHandoffPath(path);
      deleted.push(entry.name);
    }
  }
  if (deleted.length > 0) await syncWalletHandoffDirectory(input.root);
  return deleted;
}
