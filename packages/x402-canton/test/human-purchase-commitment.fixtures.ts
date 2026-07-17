import {
  type AuthenticatedHumanPayerIdentity,
  claimHumanPackagePreferenceObservation,
  commitHttpRequest,
  createHumanPaymentObserver,
  createHumanPackagePreferenceObserver,
  type HttpRequestBindingInput,
  type HumanPaymentObservation,
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
  expectedAsset: "CC",
  expectedAdmin: DSO,
  expectedInstrumentId: "Amulet",
  maximumAllowedFeeAtomic: "1000000000",
});

export type HumanChallengeFixture = {
  accepts: Array<{
    amount: string;
    asset: string;
    extra: {
      assetTransferMethod: string;
      executeBeforeSeconds: number;
      feePayer: string;
      instrumentId: { admin: string; id: string };
      memo: string;
      synchronizerId: string;
      [key: string]: unknown;
    };
    maxTimeoutSeconds: number;
    network: string;
    payTo: string;
    scheme: string;
    [key: string]: unknown;
  }>;
  resource: { url: string; [key: string]: unknown };
  x402Version: number;
  [key: string]: unknown;
};

export type HumanPurchaseFixtureOptions = Readonly<{
  maximumFeeAtomic?: string;
  mutateChallenge?: (challenge: HumanChallengeFixture) => void;
  packageAdminParty?: string;
  packageProviderParty?: string;
  payerIdentity?: AuthenticatedHumanPayerIdentity;
  request?: HttpRequestBindingInput;
}>;

export function humanPackageClosure() {
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

export async function createHumanPackageSelection(
  payerIdentity: AuthenticatedHumanPayerIdentity,
  paymentObservation: HumanPaymentObservation,
  adminParty: string,
  providerParty: string,
  executeBefore: string,
) {
  const closure = humanPackageClosure();
  const packageScope = {
    adminParty,
    challengeId: paymentObservation.challengeId,
    challengeObservedAt: paymentObservation.observedAt,
    closure,
    executeBefore,
    payerIdentity,
    providerParty,
    vettingValidAt: "2026-07-16T15:00:30.000Z",
  };
  const observation = await createHumanPackagePreferenceObserver({
    readAuthenticatedSubject: async () => "validator-devnet-m2m",
    readPackageReferences: async () => liveReferences(closure),
  })(packageScope);
  return claimHumanPackagePreferenceObservation(observation, packageScope);
}

export async function createHumanPurchaseInput(
  options: HumanPurchaseFixtureOptions = {},
) {
  const request = options.request ?? { method: "GET", url: RESOURCE_URL };
  const binding = commitHttpRequest(request);
  const payerIdentity =
    options.payerIdentity ?? (await authenticatedHumanPayerIdentity());
  const challenge: HumanChallengeFixture = {
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
  options.mutateChallenge?.(challenge);
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
  )(request);
  const requirement = challenge.accepts[0]!;
  const executeBefore = new Date(
    Date.parse(paymentObservation.observedAt) +
      Math.min(
        requirement.maxTimeoutSeconds,
        requirement.extra.executeBeforeSeconds,
      ) *
        1_000,
  ).toISOString();
  const packageSelection = await createHumanPackageSelection(
    payerIdentity,
    paymentObservation,
    options.packageAdminParty ?? requirement.extra.instrumentId.admin,
    options.packageProviderParty ?? requirement.payTo,
    executeBefore,
  );
  return {
    maximumFeeAtomic:
      options.maximumFeeAtomic ?? HUMAN_PURCHASE_MAXIMUM_FEE_ATOMIC,
    packageSelection,
    payerIdentity,
    paymentObservation,
  };
}
