export const WALLET_HANDOFF_DIRECTORY_NAME = ".capability-wallet";
export const WALLET_HANDOFF_VERSION = "sotto-wallet-handoff-v1";

const ID_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/u;
export const WALLET_HANDOFF_FILE_PATTERN =
  /^([a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?)\.(request|response)\.json$/u;

export type OwnerOnlyWalletArtifactKind = "request" | "response";
export type WalletHandoffKind = "request" | "response";

export type OwnerOnlyWalletArtifactInput<
  Kind extends OwnerOnlyWalletArtifactKind,
> = Readonly<{
  expiresAt: string;
  id: string;
  kind: Kind;
  payload: unknown;
}>;

export type OwnerOnlyWalletArtifactRecord<
  Kind extends OwnerOnlyWalletArtifactKind,
> = OwnerOnlyWalletArtifactInput<Kind> &
  Readonly<{ version: typeof WALLET_HANDOFF_VERSION }>;

export type OwnerOnlyWalletStorage<Kind extends OwnerOnlyWalletArtifactKind> =
  Readonly<{
    claim: (
      id: string,
      kind: Kind,
    ) => Promise<OwnerOnlyWalletArtifactRecord<Kind>>;
    cleanupExpired: () => Promise<string[]>;
    create: (input: OwnerOnlyWalletArtifactInput<Kind>) => Promise<void>;
    read: (
      id: string,
      kind: Kind,
    ) => Promise<OwnerOnlyWalletArtifactRecord<Kind>>;
  }>;

export type WalletHandoffInput =
  OwnerOnlyWalletArtifactInput<WalletHandoffKind>;
export type WalletHandoffRecord =
  OwnerOnlyWalletArtifactRecord<WalletHandoffKind>;
export type WalletHandoffStorage = OwnerOnlyWalletStorage<WalletHandoffKind>;

export function requireWalletHandoffId(id: string): string {
  if (!ID_PATTERN.test(id))
    throw new Error("wallet handoff identifier is invalid");
  return id;
}

export function requireWalletArtifactKind(
  kind: string,
): OwnerOnlyWalletArtifactKind {
  if (kind !== "request" && kind !== "response") {
    throw new Error("wallet handoff kind is invalid");
  }
  return kind;
}

export function requireWalletHandoffTime(value: string): number {
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new Error("wallet handoff expiry is invalid");
  }
  return milliseconds;
}

export function createOwnerOnlyWalletArtifactRecord<
  Kind extends OwnerOnlyWalletArtifactKind,
>(
  candidate: OwnerOnlyWalletArtifactInput<Kind>,
  now: number,
): OwnerOnlyWalletArtifactRecord<Kind> {
  const record: OwnerOnlyWalletArtifactRecord<Kind> = Object.freeze({
    expiresAt: candidate.expiresAt,
    id: requireWalletHandoffId(candidate.id),
    kind: requireWalletArtifactKind(candidate.kind) as Kind,
    payload: candidate.payload,
    version: WALLET_HANDOFF_VERSION,
  });
  if (requireWalletHandoffTime(record.expiresAt) <= now) {
    throw new Error("wallet handoff artifact is already expired");
  }
  return record;
}

export function parseOwnerOnlyWalletArtifactRecord(
  value: unknown,
): OwnerOnlyWalletArtifactRecord<OwnerOnlyWalletArtifactKind> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("wallet handoff record is invalid");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join() !== "expiresAt,id,kind,payload,version" ||
    record.version !== WALLET_HANDOFF_VERSION ||
    typeof record.expiresAt !== "string" ||
    typeof record.id !== "string" ||
    typeof record.kind !== "string"
  ) {
    throw new Error("wallet handoff record keys are invalid");
  }
  requireWalletHandoffTime(record.expiresAt);
  return Object.freeze({
    expiresAt: record.expiresAt,
    id: requireWalletHandoffId(record.id),
    kind: requireWalletArtifactKind(record.kind),
    payload: record.payload,
    version: WALLET_HANDOFF_VERSION,
  });
}
