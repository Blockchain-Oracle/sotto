import {
  claimHumanPackagePreferenceObservation,
  createHumanPackagePreferenceObserver,
  type AuthenticatedHumanPackagePreference,
  type HumanPackagePreferenceScope,
} from "@sotto/x402-canton";

type SplicePackageReference = Readonly<{
  packageId: string;
  name: string;
  version: string;
}>;

export async function claimRealHumanPackageSelection(
  reference: SplicePackageReference,
  scope: HumanPackagePreferenceScope,
): Promise<AuthenticatedHumanPackagePreference> {
  const observation = await createHumanPackagePreferenceObserver({
    readAuthenticatedSubject: async () => "validator-devnet-m2m",
    readPackageReferences: async () => [
      {
        packageId: reference.packageId,
        packageName: reference.name,
        packageVersion: reference.version,
      },
    ],
  })(scope);
  return claimHumanPackagePreferenceObservation(observation, scope);
}
