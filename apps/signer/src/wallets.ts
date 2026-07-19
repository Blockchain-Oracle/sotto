import { join } from "node:path";
import {
  ensureOwnerOnlyDirectory,
  readOwnerJson,
  writeOwnerJson,
  RECORD_ID_PATTERN,
} from "./store.js";

export const WALLET_RECORD_VERSION = "sotto-signer-wallet-v1" as const;

export type WalletOnboardingState =
  "created" | "onboarding-started" | "onboarded" | "onboarding-uncertain";

export type WalletFundingRecord = Readonly<{
  amount: string;
  state: "tap-submitted" | "funded";
  submissionId: string;
  updateId?: string;
}>;

export type WalletRecord = Readonly<{
  version: typeof WALLET_RECORD_VERSION;
  walletId: string;
  ownerHint: string;
  fingerprint: `1220${string}`;
  partyHint: string;
  state: WalletOnboardingState;
  partyId?: string;
  synchronizerId?: string;
  funding?: WalletFundingRecord;
  createdAt: string;
  updatedAt: string;
}>;

export type WalletDirectory = Readonly<{
  read: (walletId: string) => Promise<WalletRecord | undefined>;
  write: (record: WalletRecord) => Promise<void>;
}>;

const FINGERPRINT = /^1220[0-9a-f]{64}$/u;

function isWalletRecord(value: unknown): value is WalletRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === WALLET_RECORD_VERSION &&
    typeof record.walletId === "string" &&
    RECORD_ID_PATTERN.test(record.walletId) &&
    typeof record.ownerHint === "string" &&
    typeof record.fingerprint === "string" &&
    FINGERPRINT.test(record.fingerprint) &&
    typeof record.partyHint === "string" &&
    typeof record.state === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string" &&
    (record.partyId === undefined || typeof record.partyId === "string")
  );
}

export async function createWalletDirectory(
  keyDirectory: string,
): Promise<WalletDirectory> {
  const directory = await ensureOwnerOnlyDirectory(
    join(keyDirectory, "wallets"),
  );

  const read = async (walletId: string): Promise<WalletRecord | undefined> => {
    if (!RECORD_ID_PATTERN.test(walletId)) return undefined;
    const value = await readOwnerJson(directory, `${walletId}.json`);
    if (value === undefined) return undefined;
    if (!isWalletRecord(value)) {
      throw new Error("signer wallet record is invalid");
    }
    return value;
  };

  const write = async (record: WalletRecord): Promise<void> => {
    if (!isWalletRecord(record)) {
      throw new Error("signer wallet record is invalid");
    }
    await writeOwnerJson(directory, `${record.walletId}.json`, record);
  };

  return Object.freeze({ read, write });
}
