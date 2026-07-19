import {
  claimHumanPackagePreferenceObservation,
  createHumanPackagePreferenceObserver,
  type HumanPurchaseLedgerIntent,
} from "@sotto/x402-canton";
import type { HumanPrepareAuthorityRestoreInput } from "@sotto/x402-canton/internal/human-prepare-authority-persistence";
import {
  ADMIN,
  spliceClosure,
  walletPreflight,
} from "./purchase-authenticated-intent.fixture.js";

export const HUMAN_PURCHASE_TRUSTED_CONFIGURATION = Object.freeze({
  contractId: "00tokenfactory7",
  expectedAsset: "CC",
  expectedAdmin: ADMIN,
  expectedInstrumentId: "Amulet",
  maximumAllowedFeeAtomic: "1000000000",
});

export async function freshHumanPrepareAuthority(
  intent: HumanPurchaseLedgerIntent,
  requestApproval?: Parameters<typeof walletPreflight>[1],
): Promise<HumanPrepareAuthorityRestoreInput> {
  const closure = spliceClosure();
  const reference = closure.graphPackages.find(
    ({ name }) => name === "splice-amulet",
  );
  if (reference === undefined) {
    throw new Error("test Splice package is absent");
  }
  const wallet = await walletPreflight(reference.packageId, requestApproval);
  const scope = {
    adminParty: intent.challenge.instrument.admin,
    challengeId: intent.challenge.challengeId,
    challengeObservedAt: intent.challenge.requestedAt,
    closure,
    executeBefore: intent.challenge.executeBefore,
    providerParty: intent.challenge.recipientParty,
    vettingValidAt: intent.packageSelection.vettingValidAt,
    walletPreflight: wallet,
  };
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
  return Object.freeze({
    packageSelection: claimHumanPackagePreferenceObservation(
      observation,
      scope,
    ),
    trustedConfiguration: HUMAN_PURCHASE_TRUSTED_CONFIGURATION,
    walletPreflight: wallet,
  });
}
