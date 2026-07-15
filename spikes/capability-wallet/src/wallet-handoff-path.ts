import { constants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import { dirname, join, parse, resolve, sep } from "node:path";
import type { OwnerOnlyWalletArtifactKind } from "./wallet-handoff-types.js";
import { walletHandoffTombstonePayload } from "./wallet-handoff-tombstone.js";

const RESERVE_FLAGS =
  constants.O_WRONLY |
  constants.O_CREAT |
  constants.O_EXCL |
  constants.O_NOFOLLOW;

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function requireCurrentOwner(uid: number, label: string): void {
  if (typeof process.getuid === "function" && uid !== process.getuid()) {
    throw new Error(`${label} must be owned by the wallet user`);
  }
}

async function requireNoSymbolicAncestors(path: string): Promise<void> {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  const components = absolute.slice(root.length).split(sep).filter(Boolean);
  for (const component of components) {
    current = join(current, component);
    const status = await lstat(current);
    if (status.isSymbolicLink()) {
      throw new Error("wallet handoff path has a symbolic ancestor");
    }
    if (!status.isDirectory()) {
      throw new Error("wallet handoff ancestor must be a directory");
    }
  }
}

export async function requireWalletHandoffRoot(root: string): Promise<void> {
  await requireNoSymbolicAncestors(dirname(root));
  try {
    await mkdir(root, { mode: 0o700 });
  } catch (error) {
    if (errorCode(error) !== "EEXIST") throw error;
  }
  const status = await lstat(root);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error("wallet handoff directory must not be symbolic");
  }
  requireCurrentOwner(status.uid, "wallet handoff directory");
  if ((status.mode & 0o777) !== 0o700) {
    throw new Error("wallet handoff directory must use mode 0700");
  }
}

export async function syncWalletHandoffDirectory(root: string): Promise<void> {
  const handle = await open(root, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export function walletHandoffReservationName(
  id: string,
  kind: OwnerOnlyWalletArtifactKind,
): string {
  return `.used-${id}.${kind}`;
}

function walletHandoffClaimName(
  id: string,
  kind: OwnerOnlyWalletArtifactKind,
): string {
  return `.claimed-${id}.${kind}`;
}

async function createWalletHandoffMarker(
  root: string,
  name: string,
  duplicateMessage: string,
  expiresAt: string,
): Promise<void> {
  const path = join(root, name);
  let handle;
  try {
    handle = await open(path, RESERVE_FLAGS, 0o600);
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      throw new Error(duplicateMessage, { cause: error });
    }
    throw error;
  }
  try {
    await handle.writeFile(walletHandoffTombstonePayload(expiresAt));
    await handle.chmod(0o600);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncWalletHandoffDirectory(root);
}

export async function reserveWalletHandoffArtifact(
  root: string,
  id: string,
  kind: OwnerOnlyWalletArtifactKind,
  expiresAt: string,
): Promise<void> {
  await createWalletHandoffMarker(
    root,
    walletHandoffReservationName(id, kind),
    "wallet handoff artifact already exists or was used",
    expiresAt,
  );
}

export async function claimWalletHandoffArtifact(
  root: string,
  id: string,
  kind: OwnerOnlyWalletArtifactKind,
  expiresAt: string,
): Promise<void> {
  await createWalletHandoffMarker(
    root,
    walletHandoffClaimName(id, kind),
    "wallet handoff artifact is already claimed",
    expiresAt,
  );
}
