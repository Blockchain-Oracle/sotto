import type { CantonPaymentRequirement } from "./payment-requirement.js";
import type { AuthenticatedHumanPackagePreference } from "./human-package-preference-types.js";
import type { AuthenticatedHumanPayerIdentity } from "./human-payer-identity.js";
import type { HumanPaymentObservation } from "./human-payment-observation-types.js";
import type { HttpRequestCommitment } from "./request-binding.js";

export type HumanPurchaseCommitmentInput = Readonly<{
  maximumFeeAtomic: string;
  packageSelection: AuthenticatedHumanPackagePreference;
  payerIdentity: AuthenticatedHumanPayerIdentity;
  paymentObservation: HumanPaymentObservation;
}>;

export type HumanPurchaseTrustedConfiguration = Readonly<{
  contractId: string;
  expectedAdmin: string;
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
  binding: HttpRequestCommitment;
  expiresAt: string;
  identity: AuthenticatedHumanPayerIdentity;
  maximumFeeAtomic: string;
  maximumTotalDebitAtomic: string;
  observedAt: string;
  packageSelection: CanonicalHumanPackageSelection;
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
