import type { PACKAGE_SELECTION_VERSION } from "./package-preference-observation-types.js";

export type CanonicalPurchasePackageSelection = Readonly<{
  version: typeof PACKAGE_SELECTION_VERSION;
  observationId: `sha256:${string}`;
  closureHash: `sha256:${string}`;
  requirements: ReadonlyArray<
    Readonly<{ packageName: string; parties: ReadonlyArray<string> }>
  >;
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

export type PurchasePackageSelectionScope = Readonly<{
  adminParty: string;
  agentParty: string;
  payerParty: string;
  providerParty: string;
  synchronizerId: string;
  challengeObservedAt: string;
  executeBefore: string;
}>;
