import type { AuthenticatedHumanPackagePreference } from "./human-package-preference-types.js";
import type { HumanPayerSigningIdentity } from "./human-purchase-ledger-intent-types.js";
import type { CanonicalHumanPackageSelection } from "./human-purchase-commitment-types.js";
import type { HumanPurchaseTrustedConfiguration } from "./human-purchase-commitment-types.js";
import type { AuthenticatedHumanWalletConnectorPreflight } from "./human-wallet-connector-types.js";
import type { HumanWalletCapabilities } from "./human-wallet-connector-types.js";

export const HUMAN_PREPARE_AUTHORITY_VERSION =
  "sotto-human-prepare-authority-v1" as const;
export const MAX_HUMAN_PREPARE_AUTHORITY_BYTES = 196_608;

export type HumanPrepareAuthorityConnector = Readonly<{
  capabilities: HumanWalletCapabilities;
  expectedPackageId: string;
}>;

export type HumanPrepareAuthorityRequestDisplay = Readonly<{
  method: string;
  queryPresent: boolean;
  resourceOrigin: string;
  resourcePath: string;
}>;

export type HumanPrepareAuthorityPayload = Readonly<{
  version: typeof HUMAN_PREPARE_AUTHORITY_VERSION;
  purchase: Readonly<{
    version: "sotto-human-purchase-v1";
    attemptId: `sha256:${string}`;
    canonicalBytes: string;
    challengeId: `sha256:${string}`;
    commitment: `sha256:${string}`;
    expiresAt: string;
    requestCommitment: `sha256:${string}`;
  }>;
  requestBindingCanonicalBytes: string;
  paymentChallengeBytes: string;
  requestDisplay: HumanPrepareAuthorityRequestDisplay;
  connector: HumanPrepareAuthorityConnector;
  trustedConfiguration: HumanPurchaseTrustedConfiguration;
  payerIdentity: HumanPayerSigningIdentity;
  packageSelection: CanonicalHumanPackageSelection;
}>;

declare const humanPrepareAuthorityPlaintextBrand: unique symbol;
export type AuthenticatedHumanPrepareAuthorityPlaintext = Readonly<{
  version: typeof HUMAN_PREPARE_AUTHORITY_VERSION;
  plaintextSha256: `sha256:${string}`;
  readonly [humanPrepareAuthorityPlaintextBrand]: true;
}>;

export type HumanPrepareAuthorityRestoreInput = Readonly<{
  packageSelection: AuthenticatedHumanPackagePreference;
  trustedConfiguration: HumanPurchaseTrustedConfiguration;
  walletPreflight: AuthenticatedHumanWalletConnectorPreflight;
}>;

export type HumanPrepareAuthorityRestoreScope = Readonly<{
  version: typeof HUMAN_PREPARE_AUTHORITY_VERSION;
  attemptId: `sha256:${string}`;
  purchaseCommitment: `sha256:${string}`;
  challenge: Readonly<{
    adminParty: string;
    challengeId: `sha256:${string}`;
    executeBefore: string;
    observedAt: string;
    payerParty: string;
    providerParty: string;
    synchronizerId: string;
  }>;
  connector: Readonly<{
    connectorId: string;
    connectorKind: HumanWalletCapabilities["connectorKind"];
    expectedPackageId: string;
    origin: string;
  }>;
  packageSelection: CanonicalHumanPackageSelection;
  payerIdentity: HumanPayerSigningIdentity;
  requestDisplay: HumanPrepareAuthorityRequestDisplay;
  trustedConfiguration: HumanPurchaseTrustedConfiguration;
}>;
