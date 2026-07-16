import type { AuthenticatedHumanPayerIdentity } from "./human-payer-identity.js";
import type { ReviewedPackagePreferenceClosure } from "./package-preference-closure.js";
import type { PackagePreferenceReader } from "./package-preference-observation-types.js";

export const HUMAN_PACKAGE_SELECTION_VERSION =
  "sotto-human-package-selection-v1" as const;

export type HumanPackagePreferenceReader = PackagePreferenceReader;

export type HumanPackagePreferenceScope = Readonly<{
  adminParty: string;
  challengeObservedAt: string;
  closure: ReviewedPackagePreferenceClosure;
  executeBefore: string;
  payerIdentity: AuthenticatedHumanPayerIdentity;
  providerParty: string;
  vettingValidAt: string;
}>;

export type HumanPackagePreferenceObservation = Readonly<{
  observationId: `sha256:${string}`;
  observedAt: string;
}>;

export type AuthenticatedHumanPackagePreference = Readonly<{
  acquiredAt: string;
  closureHash: string;
  observationId: `sha256:${string}`;
  packageIds: readonly [string];
  parties: readonly [string, string, string];
  references: readonly [
    Readonly<{
      artifactIds: ReadonlyArray<string>;
      packageId: string;
      packageName: "splice-amulet";
      packageVersion: string;
    }>,
  ];
  subjectHash: `sha256:${string}`;
  synchronizerId: string;
  version: typeof HUMAN_PACKAGE_SELECTION_VERSION;
  vettingValidAt: string;
}>;

export type ValidatedHumanPackagePreferenceScope = Readonly<{
  adminParty: string;
  challengeObservedAt: string;
  closure: ReviewedPackagePreferenceClosure;
  executeBefore: string;
  parties: readonly [string, string, string];
  payerIdentity: AuthenticatedHumanPayerIdentity;
  providerParty: string;
  synchronizerId: string;
  vettingValidAt: string;
}>;
