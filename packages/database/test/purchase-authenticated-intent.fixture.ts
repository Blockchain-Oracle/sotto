import {
  buildReviewedPackagePreferenceClosure,
  claimHumanPackagePreferenceObservation,
  commitHttpRequest,
  createHumanPackagePreferenceObserver,
  createHumanPayerIdentityObserver,
  createHumanPaymentObserver,
  createHumanPurchaseCommitter,
  createHumanWalletConnectorPreflight,
  HUMAN_PURCHASE_APPROVAL_VERSION,
  readHumanPurchaseLedgerIntent,
  type AuthenticatedHumanWalletConnectorPreflight,
  type HttpRequestBindingInput,
  type HumanPurchaseLedgerIntent,
  type HumanWalletConnector,
} from "@sotto/x402-canton";
import { validClosureInput } from "../../x402-canton/test/package-preference-closure.fixtures.js";
const PAYER_FINGERPRINT = `1220${"a".repeat(64)}`;
export const PAYER = `sotto-external-payer::${PAYER_FINGERPRINT}`;
export const PROVIDER = "sotto-provider::1220provider";
export const ADMIN = "DSO::1220dso";
export const SYNCHRONIZER = `global-domain::1220${"b".repeat(64)}`;
export type JournalChallenge = {
  resource: { url: string };
  accepts: Array<
    {
      maxTimeoutSeconds: number;
      extra: { executeBeforeSeconds: number } & Record<string, unknown>;
    } & Record<string, unknown>
  >;
} & Record<string, unknown>;
export function spliceClosure() {
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

function payerObserver() {
  return createHumanPayerIdentityObserver({
    readAuthenticatedSubject: async () => "validator-devnet-m2m",
    readPayerIdentity: async () => ({
      keyPurpose: "SIGNING",
      network: "canton:devnet",
      party: PAYER,
      publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
      publicKeyFingerprint: PAYER_FINGERPRINT,
      signatureFormat: "SIGNATURE_FORMAT_CONCAT",
      signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
      synchronizerId: SYNCHRONIZER,
      topologyHash: `1220${"c".repeat(64)}`,
    }),
  });
}
export async function walletPreflight(
  packageId: string,
  requestApproval: HumanWalletConnector["requestApproval"] = async () => {
    throw new Error("journal fixture cannot request wallet approval");
  },
): Promise<AuthenticatedHumanWalletConnectorPreflight> {
  const capabilities = Object.freeze({
    version: "sotto-human-wallet-capabilities-v1" as const,
    approvalVersions: [HUMAN_PURCHASE_APPROVAL_VERSION],
    connectorId: "wallet-sdk-production-test",
    connectorKind: "wallet-sdk" as const,
    explicitApproval: true as const,
    hashingSchemeVersions: ["HASHING_SCHEME_VERSION_V2"],
    networks: ["canton:devnet" as const],
    origin: "wallet://sotto-production-test",
    packageIds: [packageId],
    payerParty: PAYER,
    preparedTransactionSigning: true as const,
    signingKey: Object.freeze({
      fingerprint: PAYER_FINGERPRINT,
      publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW" as const,
      purpose: "SIGNING" as const,
      signatureFormat: "SIGNATURE_FORMAT_CONCAT" as const,
      signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519" as const,
    }),
    synchronizerIds: [SYNCHRONIZER],
  });
  const connector: HumanWalletConnector = {
    discover: async () => capabilities,
    requestApproval,
  };
  const result = await createHumanWalletConnectorPreflight({
    connector,
    connectorId: capabilities.connectorId,
    connectorKind: capabilities.connectorKind,
    connectorOrigin: capabilities.origin,
    expectedPackageId: packageId,
    observePayerIdentity: payerObserver(),
  });
  if (result.outcome !== "compatible")
    throw new Error("journal fixture wallet is incompatible");
  return result;
}
export async function authenticatedCatalogHumanPurchaseIntent(
  resourceUrl: string,
  mutateChallenge: (challenge: JournalChallenge) => void = () => undefined,
  requestInput?: HttpRequestBindingInput,
): Promise<HumanPurchaseLedgerIntent> {
  const closure = spliceClosure();
  const packageReference = closure.graphPackages.find(
    ({ name }) => name === "splice-amulet",
  )!;
  const preflight = await walletPreflight(packageReference.packageId);
  const request = requestInput ?? { method: "GET", url: resourceUrl };
  const binding = commitHttpRequest(request);
  const challenge: JournalChallenge = {
    x402Version: 2,
    resource: { url: resourceUrl },
    accepts: [
      {
        scheme: "exact",
        network: "canton:devnet",
        amount: "2500000000",
        asset: "CC",
        payTo: PROVIDER,
        maxTimeoutSeconds: 600,
        extra: {
          assetTransferMethod: "transfer-factory",
          executeBeforeSeconds: 600,
          feePayer: PAYER,
          instrumentId: { admin: ADMIN, id: "Amulet" },
          memo: binding.commitment,
          synchronizerId: SYNCHRONIZER,
        },
      },
    ],
  };
  mutateChallenge(challenge);
  const payment = await createHumanPaymentObserver(
    async () =>
      new Response(null, {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(challenge)).toString(
            "base64",
          ),
        },
      }),
  )(request);
  const observedAt = Date.parse(payment.observedAt);
  const requirement = challenge.accepts[0]!;
  const executeBefore = new Date(
    observedAt +
      Math.min(
        requirement.maxTimeoutSeconds,
        requirement.extra.executeBeforeSeconds,
      ) *
        1_000,
  ).toISOString();
  const packageScope = {
    adminParty: ADMIN,
    challengeId: payment.challengeId,
    challengeObservedAt: payment.observedAt,
    closure,
    executeBefore,
    providerParty: PROVIDER,
    vettingValidAt: new Date(observedAt + 30_000).toISOString(),
    walletPreflight: preflight,
  };
  const packageObservation = await createHumanPackagePreferenceObserver({
    readAuthenticatedSubject: async () => "validator-devnet-m2m",
    readPackageReferences: async () => [
      {
        packageId: packageReference.packageId,
        packageName: packageReference.name,
        packageVersion: packageReference.version,
      },
    ],
  })(packageScope);
  const packageSelection = claimHumanPackagePreferenceObservation(
    packageObservation,
    packageScope,
  );
  const commitment = createHumanPurchaseCommitter({
    contractId: "00tokenfactory7",
    expectedAsset: "CC",
    expectedAdmin: ADMIN,
    expectedInstrumentId: "Amulet",
    maximumAllowedFeeAtomic: "1000000000",
  })({
    maximumFeeAtomic: "750000000",
    packageSelection,
    paymentObservation: payment,
    walletPreflight: preflight,
  });
  return readHumanPurchaseLedgerIntent(commitment);
}
