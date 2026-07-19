import type { ReferenceWalletPreparedHashSignature } from "@sotto/capability-wallet";
import type { ApprovalStore } from "./approval-store.js";
import type { SignerEnvironment } from "./env.js";
import type { FiveNorthRunner } from "./five-north.js";
import type { SignerKeystore } from "./keystore.js";
import type { WalletDirectory } from "./wallets.js";

export type RecomputePreparedHash = (
  preparedTransaction: Uint8Array,
) => Promise<Uint8Array>;

export type SignPreparedHash = (
  keyFile: string,
  preparedTransactionHash: `sha256:${string}`,
  expectedFingerprint: `1220${string}`,
) => Promise<ReferenceWalletPreparedHashSignature>;

export type SignerContext = Readonly<{
  approvals: ApprovalStore;
  env: SignerEnvironment;
  fiveNorth: FiveNorthRunner | undefined;
  keystore: SignerKeystore;
  now: () => number;
  recomputePreparedHash: RecomputePreparedHash;
  signPreparedHash: SignPreparedHash;
  wallets: WalletDirectory;
}>;

export const WALLET_SESSION_COOKIE = "sotto_wallet_session";
