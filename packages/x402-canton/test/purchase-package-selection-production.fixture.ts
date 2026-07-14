import {
  claimPackagePreferenceObservation,
  createPackagePreferenceObserver,
} from "../src/index.js";
import {
  liveReferences,
  observationClosure,
} from "./package-preference-observation.fixtures.js";
import { reader } from "./package-preference-observation.harness.js";
import { AGENT, DSO, PAYER, PROVIDER } from "./purchase-commitment.fixtures.js";
import type { PackageSelectionFixture } from "./purchase-package-selection.fixtures.js";

const SYNCHRONIZER = "global-domain::1220sync";
const VETTING_VALID_AT = "2026-07-13T10:00:30.000Z";
const SUBJECT = "validator-devnet-m2m";

export async function claimProductionPackageSelection(): Promise<{
  observationId: string;
  projection: PackageSelectionFixture;
}> {
  const closure = observationClosure();
  const observation = await createPackagePreferenceObserver(
    reader(liveReferences(closure)),
  )({
    closure,
    synchronizerId: SYNCHRONIZER,
    vettingValidAt: VETTING_VALID_AT,
    payerParty: PAYER,
    agentParty: AGENT,
    providerParty: PROVIDER,
    adminParty: DSO,
  });
  const projection = claimPackagePreferenceObservation(observation, {
    closure,
    synchronizerId: SYNCHRONIZER,
    vettingValidAt: VETTING_VALID_AT,
    authenticatedSubject: SUBJECT,
  });
  return {
    observationId: observation.observationId,
    projection: projection as unknown as PackageSelectionFixture,
  };
}
