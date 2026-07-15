import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  InvalidWalletHandoffArtifactError,
  publishWalletHandoffBytes,
  readWalletHandoffBytes,
  removeWalletHandoffPath,
} from "./wallet-handoff-files.js";
import {
  decodeCanonicalWalletHandoffJson,
  encodeCanonicalWalletHandoffJson,
  MAX_WALLET_HANDOFF_JSON_BYTES,
} from "./wallet-handoff-json.js";
import {
  reserveWalletHandoffArtifact,
  requireWalletHandoffRoot,
  syncWalletHandoffDirectory,
} from "./wallet-handoff-path.js";
import {
  createOwnerOnlyWalletArtifactRecord,
  parseOwnerOnlyWalletArtifactRecord,
  requireWalletArtifactKind,
  requireWalletHandoffId,
  requireWalletHandoffTime,
  WALLET_HANDOFF_DIRECTORY_NAME,
  WALLET_HANDOFF_FILE_PATTERN,
  type OwnerOnlyWalletArtifactInput,
  type OwnerOnlyWalletArtifactKind,
  type OwnerOnlyWalletStorage,
  type WalletHandoffInput,
  type WalletHandoffKind,
  type WalletHandoffRecord,
  type WalletHandoffStorage,
} from "./wallet-handoff-types.js";
import { walletHandoffTemporaryStatus } from "./wallet-handoff-temporary.js";

export { MAX_WALLET_HANDOFF_JSON_BYTES };
export type {
  WalletHandoffInput,
  WalletHandoffKind,
  WalletHandoffRecord,
  WalletHandoffStorage,
};

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

export async function createOwnerOnlyWalletStorage<
  Kind extends OwnerOnlyWalletArtifactKind,
>(input: {
  allowedKinds: readonly Kind[];
  directoryName: string;
  now?: () => number;
  readBytes?: typeof readWalletHandoffBytes;
  rootDirectory: string;
}): Promise<OwnerOnlyWalletStorage<Kind>> {
  const root = resolve(input.rootDirectory);
  if (basename(root) !== input.directoryName) {
    throw new Error(
      `wallet handoff directory must be named ${input.directoryName}`,
    );
  }
  const allowedKinds = new Set<OwnerOnlyWalletArtifactKind>(input.allowedKinds);
  const now = input.now ?? Date.now;
  const readBytes = input.readBytes ?? readWalletHandoffBytes;
  await requireWalletHandoffRoot(root);

  const requireAllowedKind = (kind: string): Kind => {
    const valid = requireWalletArtifactKind(kind);
    if (!allowedKinds.has(valid)) {
      throw new Error("wallet handoff kind is not allowed in this directory");
    }
    return valid as Kind;
  };
  const artifactPath = (id: string, kind: Kind) =>
    join(
      root,
      `${requireWalletHandoffId(id)}.${requireAllowedKind(kind)}.json`,
    );
  const readRecord = async (id: string, kind: Kind) => {
    const bytes = await readBytes(artifactPath(id, kind));
    try {
      const record = parseOwnerOnlyWalletArtifactRecord(
        decodeCanonicalWalletHandoffJson(bytes),
      );
      if (record.id !== id || record.kind !== kind) {
        throw new Error(
          "wallet handoff record identity does not match its file",
        );
      }
      return record as Awaited<
        ReturnType<OwnerOnlyWalletStorage<Kind>["read"]>
      >;
    } catch (error) {
      if (error instanceof InvalidWalletHandoffArtifactError) throw error;
      throw new InvalidWalletHandoffArtifactError(
        `wallet handoff artifact is invalid: ${
          error instanceof Error ? error.message : "unknown validation error"
        }`,
        { cause: error },
      );
    }
  };

  const create = async (
    candidate: OwnerOnlyWalletArtifactInput<Kind>,
  ): Promise<void> => {
    const kind = requireAllowedKind(candidate.kind);
    const record = createOwnerOnlyWalletArtifactRecord(
      { ...candidate, kind },
      now(),
    );
    const bytes = encodeCanonicalWalletHandoffJson(record);
    await requireWalletHandoffRoot(root);
    await reserveWalletHandoffArtifact(root, record.id, record.kind);
    await publishWalletHandoffBytes(root, artifactPath(record.id, kind), bytes);
  };

  const read = async (id: string, kind: Kind) => {
    await requireWalletHandoffRoot(root);
    const validId = requireWalletHandoffId(id);
    const validKind = requireAllowedKind(kind);
    const record = await readRecord(validId, validKind);
    if (requireWalletHandoffTime(record.expiresAt) <= now()) {
      await removeWalletHandoffPath(artifactPath(validId, validKind));
      await syncWalletHandoffDirectory(root);
      throw new Error("wallet handoff artifact is expired");
    }
    return record;
  };

  const cleanupExpired = async () => {
    await requireWalletHandoffRoot(root);
    const deleted: string[] = [];
    const entries = (await readdir(root, { withFileTypes: true })).sort(
      (left, right) => utf8Compare(left.name, right.name),
    );
    for (const entry of entries) {
      const path = join(root, entry.name);
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
      const match = WALLET_HANDOFF_FILE_PATTERN.exec(entry.name);
      if (match === null) continue;
      let record;
      try {
        const kind = requireAllowedKind(match[2]!);
        record = await readRecord(match[1]!, kind);
      } catch (error) {
        if (errorCode(error) === "ENOENT") continue;
        if (!(error instanceof InvalidWalletHandoffArtifactError)) throw error;
        await removeWalletHandoffPath(path);
        deleted.push(entry.name);
        continue;
      }
      if (requireWalletHandoffTime(record.expiresAt) <= now()) {
        await removeWalletHandoffPath(path);
        deleted.push(entry.name);
      }
    }
    if (deleted.length > 0) await syncWalletHandoffDirectory(root);
    return deleted;
  };

  return Object.freeze({ cleanupExpired, create, read });
}

export function createWalletHandoffStorage(input: {
  now?: () => number;
  rootDirectory: string;
}): Promise<WalletHandoffStorage> {
  return createOwnerOnlyWalletStorage({
    ...input,
    allowedKinds: ["request", "response"] as const,
    directoryName: WALLET_HANDOFF_DIRECTORY_NAME,
  });
}
