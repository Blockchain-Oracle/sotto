import type { ReviewedPackagePreferenceClosure } from "./package-preference-closure.js";

export const PACKAGE_SELECTION_VERSION = "sotto-package-selection-v1" as const;

export interface PackagePreferenceReadRequest {
  readonly packageRequirements: ReadonlyArray<
    Readonly<{
      packageName: string;
      parties: ReadonlyArray<string>;
    }>
  >;
  readonly synchronizerId: string;
  readonly vettingValidAt: string;
}

export interface PackagePreferenceReader {
  readAuthenticatedSubject(): Promise<unknown>;
  readPackageReferences(
    request: PackagePreferenceReadRequest,
  ): Promise<unknown>;
}

export interface PackagePreferenceObservationScope {
  readonly closure: ReviewedPackagePreferenceClosure;
  readonly synchronizerId: string;
  readonly vettingValidAt: string;
  readonly payerParty: string;
  readonly agentParty: string;
  readonly providerParty: string;
  readonly adminParty: string;
}

export interface PackagePreferenceClaimScope {
  readonly closure: ReviewedPackagePreferenceClosure;
  readonly synchronizerId: string;
  readonly vettingValidAt: string;
  readonly authenticatedSubject: string;
}

declare const packagePreferenceObservationBrand: unique symbol;

export type PackagePreferenceObservation = Readonly<{
  observationId: `sha256:${string}`;
  observedAt: string;
  readonly [packagePreferenceObservationBrand]: true;
}>;

export type AuthenticatedPackagePreferenceProjection = Readonly<{
  version: typeof PACKAGE_SELECTION_VERSION;
  observationId: `sha256:${string}`;
  closureHash: string;
  references: ReadonlyArray<
    Readonly<{
      packageId: string;
      packageName: string;
      packageVersion: string;
      artifactIds: ReadonlyArray<string>;
    }>
  >;
  packageIds: ReadonlyArray<string>;
  parties: ReadonlyArray<string>;
  synchronizerId: string;
  vettingValidAt: string;
  acquiredAt: string;
  authenticatedSubject: string;
}>;
