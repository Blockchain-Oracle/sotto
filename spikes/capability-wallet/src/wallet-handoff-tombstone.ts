import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { requireWalletHandoffTime } from "./wallet-handoff-types.js";

const TOMBSTONE_PATTERN =
  /^\.(?:used|claimed)-[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?\.(?:request|response)$/u;
export const WALLET_HANDOFF_TOMBSTONE_MARGIN_MS = 60_000;
export const WALLET_HANDOFF_INCOMPLETE_TOMBSTONE_RETENTION_MS =
  10 * 60 * 1_000 + WALLET_HANDOFF_TOMBSTONE_MARGIN_MS;

function requireCurrentOwner(uid: number): void {
  if (typeof process.getuid === "function" && uid !== process.getuid()) {
    throw new Error(
      "wallet handoff tombstone must be owned by the wallet user",
    );
  }
}

export function isWalletHandoffTombstone(name: string): boolean {
  return TOMBSTONE_PATTERN.test(name);
}

export function walletHandoffTombstonePayload(expiresAt: string): string {
  const retainUntil =
    requireWalletHandoffTime(expiresAt) + WALLET_HANDOFF_TOMBSTONE_MARGIN_MS;
  if (!Number.isSafeInteger(retainUntil)) {
    throw new Error("wallet handoff tombstone expiry is invalid");
  }
  return `${new Date(retainUntil).toISOString()}\n`;
}

export async function isExpiredWalletHandoffTombstone(
  path: string,
  now: number,
): Promise<boolean> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const status = await handle.stat();
    requireCurrentOwner(status.uid);
    if (
      !status.isFile() ||
      status.nlink !== 1 ||
      (status.mode & 0o777) !== 0o600
    ) {
      throw new Error("wallet handoff tombstone is not owner-only and bounded");
    }
    if (status.size < 25) {
      if (!Number.isFinite(status.mtimeMs)) {
        throw new Error("wallet handoff tombstone time is invalid");
      }
      return (
        status.mtimeMs + WALLET_HANDOFF_INCOMPLETE_TOMBSTONE_RETENTION_MS <= now
      );
    }
    if (status.size !== 25) {
      throw new Error("wallet handoff tombstone is not owner-only and bounded");
    }
    const source = await handle.readFile("utf8");
    if (!source.endsWith("\n")) {
      throw new Error("wallet handoff tombstone is invalid");
    }
    return requireWalletHandoffTime(source.slice(0, -1)) <= now;
  } finally {
    await handle.close();
  }
}
