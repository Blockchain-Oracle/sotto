import {
  claimHumanPackagePreferenceObservation,
  commitHttpRequest,
  createHumanPaymentObserver,
  createHumanPackagePreferenceObserver,
} from "../src/index.js";
import { buildReviewedPackagePreferenceClosure } from "../src/package-preference-closure.js";
import { validClosureInput } from "./package-preference-closure.fixtures.js";
import { liveReferences } from "./package-preference-observation.fixtures.js";
import { DSO, PROVIDER, RESOURCE_URL } from "./purchase-commitment.fixtures.js";
import {
  authenticatedHumanPayerIdentity,
  HUMAN_PAYER,
  HUMAN_SYNCHRONIZER,
} from "./human-payer-identity.fixtures.js";

export const HUMAN_PURCHASE_NOW = "2026-07-16T15:00:00.000Z";
export const HUMAN_PURCHASE_EXPIRES_AT = "2026-07-16T15:10:00.000Z";
export const HUMAN_PURCHASE_AMOUNT_ATOMIC = "2500000000";
export const HUMAN_PURCHASE_MAXIMUM_FEE_ATOMIC = "750000000";
export const HUMAN_PURCHASE_MAXIMUM_DEBIT_ATOMIC = "3250000000";
export const HUMAN_AUTHORIZATION_INSTANCE_ID = "human-authorization-1";
export const HUMAN_TOKEN_FACTORY_CONFIGURATION = Object.freeze({
  contractId: "00tokenfactory7",
  expectedAdmin: DSO,
  maximumAllowedFeeAtomic: "1000000000",
});

function humanClosure() {
  const input = validClosureInput();
  input.artifacts = input.artifacts.filter(
    ({ name }) => name === "splice-amulet",
  );
  const packageIds = new Set(
    input.artifacts.flatMap(({ packages }) =>
      packages.map(({ packageId }) => packageId),
    ),
  );
  input.graphPackages = input.graphPackages.filter(({ packageId }) =>
    packageIds.has(packageId),
  );
  input.selectablePackageNames = ["splice-amulet"];
  return buildReviewedPackagePreferenceClosure(input);
}

export async function createHumanPurchaseInput() {
  const binding = commitHttpRequest({ method: "GET", url: RESOURCE_URL });
  const payerIdentity = await authenticatedHumanPayerIdentity();
  const challenge = {
    x402Version: 2,
    resource: { url: RESOURCE_URL },
    accepts: [
      {
        scheme: "exact",
        network: "canton:devnet",
        amount: HUMAN_PURCHASE_AMOUNT_ATOMIC,
        asset: "CC",
        payTo: PROVIDER,
        maxTimeoutSeconds: 600,
        extra: {
          assetTransferMethod: "transfer-factory",
          executeBeforeSeconds: 600,
          feePayer: HUMAN_PAYER,
          instrumentId: { admin: DSO, id: "Amulet" },
          memo: binding.commitment,
          synchronizerId: HUMAN_SYNCHRONIZER,
        },
      },
    ],
  };
  const paymentObservation = await createHumanPaymentObserver(
    async () =>
      new Response(null, {
        headers: {
          "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(challenge)).toString(
            "base64",
          ),
        },
        status: 402,
      }),
  )({ method: "GET", url: RESOURCE_URL });
  const closure = humanClosure();
  const packageScope = {
    adminParty: DSO,
    challengeId: paymentObservation.challengeId,
    challengeObservedAt: HUMAN_PURCHASE_NOW,
    closure,
    executeBefore: HUMAN_PURCHASE_EXPIRES_AT,
    payerIdentity,
    providerParty: PROVIDER,
    vettingValidAt: "2026-07-16T15:00:30.000Z",
  };
  const packageObservation = await createHumanPackagePreferenceObserver({
    readAuthenticatedSubject: async () => "validator-devnet-m2m",
    readPackageReferences: async () => liveReferences(closure),
  })(packageScope);
  const packageSelection = claimHumanPackagePreferenceObservation(
    packageObservation,
    packageScope,
  );
  return {
    maximumFeeAtomic: HUMAN_PURCHASE_MAXIMUM_FEE_ATOMIC,
    packageSelection,
    payerIdentity,
    paymentObservation,
  };
}
