import { basename, join, resolve } from "node:path";
import {
  InvalidWalletHandoffArtifactError,
  publishWalletHandoffBytes,
  readWalletHandoffBytes,
  removeWalletHandoffPath,
} from "./wallet-handoff-files.js";
import { cleanupExpiredWalletHandoffArtifacts } from "./wallet-handoff-cleanup.js";
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
import { claimWalletHandoffRecord } from "./wallet-handoff-claim.js";
import {
  createOwnerOnlyWalletArtifactRecord,
  parseOwnerOnlyWalletArtifactRecord,
  requireWalletArtifactKind,
  requireWalletHandoffId,
  requireWalletHandoffTime,
  WALLET_HANDOFF_DIRECTORY_NAME,
  type OwnerOnlyWalletArtifactInput,
  type OwnerOnlyWalletArtifactKind,
  type OwnerOnlyWalletStorage,
  type WalletHandoffInput,
  type WalletHandoffKind,
  type WalletHandoffRecord,
  type WalletHandoffStorage,
} from "./wallet-handoff-types.js";

export { MAX_WALLET_HANDOFF_JSON_BYTES };
export type {
  WalletHandoffInput,
  WalletHandoffKind,
  WalletHandoffRecord,
  WalletHandoffStorage,
};

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
    await reserveWalletHandoffArtifact(
      root,
      record.id,
      record.kind,
      record.expiresAt,
    );
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

  const claim = (id: string, kind: Kind) =>
    claimWalletHandoffRecord(root, id, kind, read);

  const cleanupExpired = async () => {
    await requireWalletHandoffRoot(root);
    return cleanupExpiredWalletHandoffArtifacts({
      now,
      readExpiration: async (id, kind) =>
        (await readRecord(id, requireAllowedKind(kind))).expiresAt,
      root,
    });
  };

  return Object.freeze({ claim, cleanupExpired, create, read });
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
