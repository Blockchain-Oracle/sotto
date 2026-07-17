import type { CantonPaymentRequirement } from "./payment-requirement.js";
import type { AuthenticatedHumanPackagePreference } from "./human-package-preference-types.js";
import type { AuthenticatedHumanPayerIdentity } from "./human-payer-identity.js";
import type { AuthenticatedHumanWalletConnectorPreflight } from "./human-wallet-connector-types.js";
import type { HumanPaymentObservation } from "./human-payment-observation-types.js";
import type { HttpRequestCommitment } from "./request-binding.js";

export type HumanPurchaseCommitmentInput = Readonly<{
  maximumFeeAtomic: string;
  packageSelection: AuthenticatedHumanPackagePreference;
  paymentObservation: HumanPaymentObservation;
  walletPreflight: AuthenticatedHumanWalletConnectorPreflight;
}>;

export type HumanPurchaseTrustedConfiguration = Readonly<{
  contractId: string;
  expectedAsset: string;
  expectedAdmin: string;
  expectedInstrumentId: string;
  maximumAllowedFeeAtomic: string;
}>;

export type CanonicalHumanPackageSelection = Readonly<{
  version: "sotto-human-package-selection-v1";
  closureHash: `sha256:${string}`;
  references: readonly [
    Readonly<{
      packageId: string;
      packageName: "splice-amulet";
      packageVersion: string;
      artifactIds: readonly [string];
    }>,
  ];
  packageIds: readonly [string];
  parties: readonly [string, string, string];
  synchronizerId: string;
  vettingValidAt: string;
  acquiredAt: string;
  subjectHash: `sha256:${string}`;
}>;

export type ValidatedHumanPurchaseInput = Readonly<{
  authorities: Readonly<{
    packageSelection: AuthenticatedHumanPackagePreference;
    paymentObservation: HumanPaymentObservation;
    walletPreflight: AuthenticatedHumanWalletConnectorPreflight;
  }>;
  binding: HttpRequestCommitment;
  challengeId: `sha256:${string}`;
  expiresAt: string;
  identity: AuthenticatedHumanPayerIdentity;
  maximumFeeAtomic: string;
  maximumTotalDebitAtomic: string;
  observedAt: string;
  packageSelection: CanonicalHumanPackageSelection;
  requestDisplay: Readonly<{
    method: string;
    queryPresent: boolean;
    resourceOrigin: string;
    resourcePath: string;
  }>;
  requirement: CantonPaymentRequirement;
  tokenFactory: Readonly<{ contractId: string; expectedAdmin: string }>;
}>;

export type HumanPurchaseCommitment = Readonly<{
  attemptId: `sha256:${string}`;
  canonicalBytes: Uint8Array;
  challengeId: `sha256:${string}`;
  commitment: `sha256:${string}`;
  expiresAt: string;
  requestCommitment: `sha256:${string}`;
  version: "sotto-human-purchase-v1";
}>;

export type HumanPurchaseCommitter = (
  input: HumanPurchaseCommitmentInput,
) => HumanPurchaseCommitment;
