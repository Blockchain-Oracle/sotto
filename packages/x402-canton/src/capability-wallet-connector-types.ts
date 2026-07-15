import type { PreparedCapabilityBootstrapApproval } from "./prepared-capability-bootstrap-approval.js";
import type { HashVerifiedPreparedCapabilityBootstrap } from "./prepared-capability-bootstrap-hash.js";

export const CAPABILITY_WALLET_CAPABILITIES_VERSION =
  "sotto-capability-wallet-capabilities-v1" as const;
export const CAPABILITY_WALLET_REQUEST_VERSION =
  "sotto-capability-wallet-request-v1" as const;
export const CAPABILITY_WALLET_HASHING_SCHEME =
  "HASHING_SCHEME_VERSION_V2" as const;
export const CAPABILITY_WALLET_SIGNATURE_FORMAT =
  "SIGNATURE_FORMAT_RAW" as const;
export const CAPABILITY_WALLET_SIGNING_ALGORITHM =
  "SIGNING_ALGORITHM_SPEC_EC_DSA_SHA_256" as const;
export const MAX_CAPABILITY_WALLET_SESSION_MS = 10 * 60 * 1_000;

export type CapabilityWalletConnectorKind = "openrpc" | "wallet-sdk";

export type CapabilityWalletCapabilities = Readonly<{
  connectorId: string;
  connectorKind: CapabilityWalletConnectorKind;
  explicitApproval: true;
  hashingSchemeVersions: ReadonlyArray<typeof CAPABILITY_WALLET_HASHING_SCHEME>;
  networks: ReadonlyArray<`canton:${string}`>;
  origin: string;
  packageIds: ReadonlyArray<string>;
  payerParty: string;
  preparedTransactionSigning: true;
  signatureFormats: ReadonlyArray<typeof CAPABILITY_WALLET_SIGNATURE_FORMAT>;
  signingAlgorithms: ReadonlyArray<typeof CAPABILITY_WALLET_SIGNING_ALGORITHM>;
  version: typeof CAPABILITY_WALLET_CAPABILITIES_VERSION;
}>;

export type CapabilityWalletApprovalRequest = Readonly<{
  approval: PreparedCapabilityBootstrapApproval;
  capabilityIntentHash: `sha256:${string}`;
  connectorId: string;
  connectorOrigin: string;
  createdAt: string;
  expiresAt: string;
  preparedTransaction: Uint8Array;
  preparedTransactionHash: `sha256:${string}`;
  sessionId: `sha256:${string}`;
  version: typeof CAPABILITY_WALLET_REQUEST_VERSION;
}>;

export type CapabilityWalletSignatureEnvelope = Readonly<{
  party: string;
  signature: string;
  signatureFormat: typeof CAPABILITY_WALLET_SIGNATURE_FORMAT;
  signedBy: string;
  signingAlgorithm: typeof CAPABILITY_WALLET_SIGNING_ALGORITHM;
}>;

export type CapabilityWalletApprovedSessionState = {
  capabilityIntentHash: `sha256:${string}`;
  claimed: boolean;
  connectorId: string;
  connectorKind: CapabilityWalletConnectorKind;
  createdAt: number;
  expiresAt: number;
  network: `canton:${string}`;
  origin: string;
  packageId: string;
  payerParty: string;
  preparedTransaction: Uint8Array;
  preparedTransactionHash: `sha256:${string}`;
  sessionId: `sha256:${string}`;
  signature: CapabilityWalletSignatureEnvelope;
  synchronizerId: string;
};

export type CapabilityWalletConnector = Readonly<{
  discover: (options: Readonly<{ signal: AbortSignal }>) => Promise<unknown>;
  requestApproval: (
    request: CapabilityWalletApprovalRequest,
    options: Readonly<{ signal: AbortSignal }>,
  ) => Promise<unknown>;
}>;

export type CapabilityWalletSigningSessionInput = Readonly<{
  connector: CapabilityWalletConnector;
  connectorId: string;
  connectorOrigin: string;
  prepared: HashVerifiedPreparedCapabilityBootstrap;
  signal?: AbortSignal;
  timeoutMilliseconds: number;
}>;

type CapabilityWalletResultIdentity = Readonly<{
  connectorId: string;
  connectorKind: CapabilityWalletConnectorKind;
  origin: string;
}>;

export type CapabilityWalletUnsupportedResult = CapabilityWalletResultIdentity &
  Readonly<{
    outcome: "unsupported";
    reason: `unsupported-${string}`;
  }>;

export type CapabilityWalletRejectedResult = CapabilityWalletResultIdentity &
  Readonly<{
    outcome: "rejected";
    reason: "user-rejected";
    sessionId: `sha256:${string}`;
  }>;

declare const approvedCapabilityWalletSessionBrand: unique symbol;
export type ApprovedCapabilityWalletSigningSession =
  CapabilityWalletResultIdentity &
    Readonly<{
      outcome: "approved";
      sessionId: `sha256:${string}`;
      signature: CapabilityWalletSignatureEnvelope;
      readonly [approvedCapabilityWalletSessionBrand]: true;
    }>;

export type CapabilityWalletSigningResult =
  | ApprovedCapabilityWalletSigningSession
  | CapabilityWalletRejectedResult
  | CapabilityWalletUnsupportedResult;
