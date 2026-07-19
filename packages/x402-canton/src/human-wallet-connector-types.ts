import type {
  HumanPayerIdentityObservation,
  HumanPayerIdentityObservationOptions,
} from "./human-payer-identity.js";
import type { HumanObservationOptions } from "./human-observation-deadline.js";
import type {
  PreparedWalletConnector,
  WalletConnectorKind,
  WalletPublicKeyFormat,
  WalletSignatureFormat,
  WalletSigningAlgorithm,
} from "./wallet-connector-types.js";

export const HUMAN_WALLET_CAPABILITIES_VERSION =
  "sotto-human-wallet-capabilities-v1" as const;
export const HUMAN_WALLET_PREFLIGHT_VERSION =
  "sotto-human-wallet-preflight-v1" as const;
export const HUMAN_WALLET_HASHING_SCHEME = "HASHING_SCHEME_VERSION_V2" as const;
export const MAX_HUMAN_WALLET_PREFLIGHT_ACQUISITION_MS = 10_000;
export const MAX_HUMAN_WALLET_PREFLIGHT_AGE_MS = 60_000;

export type HumanWalletSigningKey = Readonly<{
  fingerprint: `1220${string}`;
  publicKeyFormat: WalletPublicKeyFormat;
  purpose: "SIGNING";
  signatureFormat: WalletSignatureFormat;
  signingAlgorithm: WalletSigningAlgorithm;
}>;

export type HumanWalletCapabilities = Readonly<{
  version: typeof HUMAN_WALLET_CAPABILITIES_VERSION;
  approvalVersions: ReadonlyArray<string>;
  connectorId: string;
  connectorKind: WalletConnectorKind;
  explicitApproval: true;
  hashingSchemeVersions: ReadonlyArray<string>;
  networks: ReadonlyArray<`canton:${string}`>;
  origin: string;
  packageIds: ReadonlyArray<string>;
  payerParty: string;
  preparedTransactionSigning: true;
  signingKey: HumanWalletSigningKey;
  synchronizerIds: ReadonlyArray<string>;
}>;

export type HumanWalletConnector = PreparedWalletConnector<unknown>;
export type HumanWalletConnectorKind = WalletConnectorKind;
export type HumanWalletPreflightOptions = HumanObservationOptions;

export type HumanWalletConnectorPreflightInput = Readonly<{
  connector: HumanWalletConnector;
  connectorId: string;
  connectorKind: HumanWalletConnectorKind;
  connectorOrigin: string;
  expectedPackageId: string;
  observePayerIdentity: (
    options?: HumanPayerIdentityObservationOptions,
  ) => Promise<HumanPayerIdentityObservation>;
}>;

export type HumanWalletUnsupportedReason =
  | "unsupported-approval-version"
  | "unsupported-capabilities-version"
  | "unsupported-explicit-approval"
  | "unsupported-hashing-scheme"
  | "unsupported-key-fingerprint"
  | "unsupported-key-format"
  | "unsupported-network"
  | "unsupported-package"
  | "unsupported-payer"
  | "unsupported-prepared-signing"
  | "unsupported-signature-scheme"
  | "unsupported-synchronizer";

export type HumanWalletUnsupportedResult = Readonly<{
  connectorId: string;
  connectorKind: HumanWalletConnectorKind;
  origin: string;
  outcome: "unsupported";
  reason: HumanWalletUnsupportedReason;
}>;

declare const authenticatedHumanWalletPreflightBrand: unique symbol;
export type AuthenticatedHumanWalletConnectorPreflight = Readonly<{
  version: typeof HUMAN_WALLET_PREFLIGHT_VERSION;
  outcome: "compatible";
  preflightId: `sha256:${string}`;
  connectorId: string;
  connectorKind: HumanWalletConnectorKind;
  origin: string;
  observedAt: string;
  readonly [authenticatedHumanWalletPreflightBrand]: true;
}>;

export type HumanWalletConnectorPreflightResult =
  AuthenticatedHumanWalletConnectorPreflight | HumanWalletUnsupportedResult;
