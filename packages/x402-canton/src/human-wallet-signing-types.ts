import type { HumanPreparedPurchaseApproval } from "./human-purchase-approval.js";
import type { HashVerifiedHumanPreparedPurchase } from "./human-prepared-purchase-hash.js";
import type {
  AuthenticatedHumanWalletConnectorPreflight,
  HumanWalletConnectorKind,
  HumanWalletUnsupportedResult,
} from "./human-wallet-connector-types.js";
import type {
  WalletPublicKeyFormat,
  WalletSignatureFormat,
  WalletSigningAlgorithm,
} from "./wallet-connector-types.js";

export const HUMAN_WALLET_SIGNING_REQUEST_VERSION =
  "sotto-human-wallet-request-v1" as const;
export const HUMAN_WALLET_SIGNING_RESPONSE_VERSION =
  "sotto-human-wallet-response-v1" as const;
export const HUMAN_WALLET_SIGNING_SESSION_VERSION =
  "sotto-human-wallet-signing-session-v1" as const;
export const MAX_HUMAN_WALLET_SIGNING_SESSION_MS = 10 * 60 * 1_000;

export type HumanWalletSignatureEnvelope = Readonly<{
  party: string;
  signature: string;
  signatureFormat: WalletSignatureFormat;
  signedBy: string;
  signingAlgorithm: WalletSigningAlgorithm;
}>;

export type HumanWalletApprovalRequest = Readonly<{
  version: typeof HUMAN_WALLET_SIGNING_REQUEST_VERSION;
  approval: HumanPreparedPurchaseApproval;
  connectorId: string;
  connectorKind: HumanWalletConnectorKind;
  connectorOrigin: string;
  createdAt: string;
  expiresAt: string;
  hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2";
  preparedTransaction: Uint8Array;
  preparedTransactionHash: `sha256:${string}`;
  sessionId: `sha256:${string}`;
}>;

export type HumanWalletRegisteredPublicKeyQuery = Readonly<{
  keyPurpose: "SIGNING";
  network: `canton:${string}`;
  party: string;
  publicKeyFormat: WalletPublicKeyFormat;
  signatureFormat: WalletSignatureFormat;
  signedBy: string;
  signingAlgorithm: WalletSigningAlgorithm;
  subjectHash: `sha256:${string}`;
  synchronizerId: string;
  topologyHash: string;
}>;

export type HumanWalletSigningSessionInput = Readonly<{
  preflight: AuthenticatedHumanWalletConnectorPreflight;
  prepared: HashVerifiedHumanPreparedPurchase;
}>;

export type HumanWalletSigningDependencies = Readonly<{
  resolveRegisteredPublicKey: (
    query: HumanWalletRegisteredPublicKeyQuery,
    options: Readonly<{ signal: AbortSignal }>,
  ) => Promise<unknown>;
}>;

export type HumanWalletApprovalStarted = Readonly<{
  connectorId: string;
  connectorKind: HumanWalletConnectorKind;
  sessionId: `sha256:${string}`;
}>;

export type HumanWalletSigningSessionOptions = Readonly<{
  onApprovalRequested?: (started: HumanWalletApprovalStarted) => Promise<void>;
  signal?: AbortSignal;
  timeoutMilliseconds?: number;
}>;

type HumanWalletSessionIdentity = Readonly<{
  version: typeof HUMAN_WALLET_SIGNING_SESSION_VERSION;
  connectorId: string;
  connectorKind: HumanWalletConnectorKind;
  origin: string;
  sessionId: `sha256:${string}`;
}>;

export type HumanWalletRejectedSigningSession = HumanWalletSessionIdentity &
  Readonly<{ outcome: "rejected"; reason: "user-rejected" }>;

declare const verifiedHumanWalletSigningSessionBrand: unique symbol;
export type VerifiedHumanWalletSigningSession = HumanWalletSessionIdentity &
  Readonly<{
    outcome: "verified";
    preparedTransactionHash: `sha256:${string}`;
    verifiedAt: string;
    readonly [verifiedHumanWalletSigningSessionBrand]: true;
  }>;

export type HumanWalletSigningResult =
  | HumanWalletRejectedSigningSession
  | HumanWalletUnsupportedResult
  | VerifiedHumanWalletSigningSession;
