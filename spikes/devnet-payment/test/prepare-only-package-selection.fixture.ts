import {
  buildReviewedPackagePreferenceClosure,
  claimPackagePreferenceObservation,
  createPackagePreferenceObserver,
} from "@sotto/x402-canton";
import { validClosureInput } from "../../../packages/x402-canton/test/package-preference-closure.fixtures.js";
import {
  AGENT,
  DSO,
  PAYER,
  PROVIDER,
} from "../../../packages/x402-canton/test/purchase-commitment.fixtures.js";

export async function claimPrepareOnlyPackageSelection() {
  const closure = buildReviewedPackagePreferenceClosure(validClosureInput());
  const references = closure.selectablePackageNames.map((packageName) => {
    const reference = closure.graphPackages.find(
      ({ name }) => name === packageName,
    );
    if (reference === undefined) throw new Error("test package is absent");
    return {
      packageId: reference.packageId,
      packageName: reference.name,
      packageVersion: reference.version,
    };
  });
  const observation = await createPackagePreferenceObserver({
    readAuthenticatedSubject: async () => "validator-devnet-m2m",
    readPackageReferences: async () => references,
  })({
    closure,
    synchronizerId: "global-domain::1220sync",
    vettingValidAt: "2026-07-13T10:00:30.000Z",
    payerParty: PAYER,
    agentParty: AGENT,
    providerParty: PROVIDER,
    adminParty: DSO,
  });
  return claimPackagePreferenceObservation(observation, {
    closure,
    synchronizerId: "global-domain::1220sync",
    vettingValidAt: "2026-07-13T10:00:30.000Z",
    authenticatedSubject: "validator-devnet-m2m",
  });
}
