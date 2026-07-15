import type {
  CapabilityWalletConnectorKind,
  CapabilityWalletSignatureFormat,
  CapabilityWalletSigningAlgorithm,
} from "./capability-wallet-connector-types.js";

export type CapabilityWalletPublicKeyFormat =
  "PUBLIC_KEY_FORMAT_DER_SPKI" | "PUBLIC_KEY_FORMAT_RAW";

export type CapabilityWalletRegisteredPublicKeyQuery = Readonly<{
  party: string;
  signatureFormat: CapabilityWalletSignatureFormat;
  signedBy: string;
  signingAlgorithm: CapabilityWalletSigningAlgorithm;
}>;

export type CapabilityWalletSignatureVerificationDependencies = Readonly<{
  resolveRegisteredPublicKey: (
    query: CapabilityWalletRegisteredPublicKeyQuery,
    options: Readonly<{ signal: AbortSignal }>,
  ) => Promise<unknown>;
}>;

declare const verifiedCapabilityWalletSignatureBrand: unique symbol;
export type VerifiedCapabilityWalletSignature = Readonly<{
  outcome: "verified";
  party: string;
  sessionId: `sha256:${string}`;
  signatureFormat: CapabilityWalletSignatureFormat;
  signedBy: string;
  signingAlgorithm: CapabilityWalletSigningAlgorithm;
  readonly [verifiedCapabilityWalletSignatureBrand]: true;
}>;

export type VerifiedCapabilityWalletSignatureClaim = Readonly<{
  capabilityIntentHash: `sha256:${string}`;
  connectorId: string;
  connectorKind: CapabilityWalletConnectorKind;
  network: `canton:${string}`;
  origin: string;
  packageId: string;
  party: string;
  preparedTransaction: Uint8Array;
  preparedTransactionHash: `sha256:${string}`;
  sessionId: `sha256:${string}`;
  signature: string;
  signatureFormat: CapabilityWalletSignatureFormat;
  signedBy: string;
  signingAlgorithm: CapabilityWalletSigningAlgorithm;
  synchronizerId: string;
}>;
