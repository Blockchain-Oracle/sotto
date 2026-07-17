import {
  claimHumanPackagePreferenceObservation,
  createHumanPayerIdentityObserver,
  createHumanPackagePreferenceObserver,
  createHumanWalletConnectorPreflight,
  FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID,
  recomputeWalletPreparedHashPrecheck,
  type HumanWalletConnector,
  type HumanPurchaseLedgerIntent,
} from "@sotto/x402-canton";
import { humanPreparedPurchaseBytes } from "../../../packages/x402-canton/test/human-prepared-purchase.fixtures.js";
import {
  HUMAN_PURCHASE_AMOUNT_ATOMIC,
  HUMAN_PURCHASE_MAXIMUM_FEE_ATOMIC,
  HUMAN_TOKEN_FACTORY_CONFIGURATION,
} from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";
import { humanHoldingEntry } from "../../../packages/x402-canton/test/human-purchase-holding.fixtures.js";
import {
  HUMAN_PAYER,
  HUMAN_SYNCHRONIZER,
} from "../../../packages/x402-canton/test/human-payer-identity.fixtures.js";
import {
  DSO,
  PROVIDER,
  RESOURCE_URL,
} from "../../../packages/x402-canton/test/purchase-commitment.fixtures.js";
import {
  externalFactoryResponse,
  responseBytes,
} from "../../../packages/x402-canton/test/transfer-factory-observation.fixtures.js";
import type { FiveNorthHumanPurchaseReaders } from "../src/five-north-human-purchase-readers.js";
import { buildFiveNorthHumanPackagePreferenceManifest } from "../src/five-north-package-preference-manifest.js";
import type {
  PrepareOnlyHumanPackageSelectionScope,
  PrepareOnlyHumanPurchaseInput,
} from "../src/prepare-only-human-purchase.js";

export { PROVIDER, RESOURCE_URL };

async function authenticatedHumanWalletPreflight(
  requestApproval?: HumanWalletConnector["requestApproval"],
) {
  const observePayerIdentity = createHumanPayerIdentityObserver({
    readAuthenticatedSubject: async () => "validator-devnet-m2m",
    readPayerIdentity: async () => ({
      keyPurpose: "SIGNING",
      network: "canton:devnet",
      party: HUMAN_PAYER,
      publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
      publicKeyFingerprint: HUMAN_PAYER.split("::")[1],
      signatureFormat: "SIGNATURE_FORMAT_CONCAT",
      signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
      synchronizerId: HUMAN_SYNCHRONIZER,
      topologyHash: `1220${"c".repeat(64)}`,
    }),
  });
  const connector = {
    discover: async () => ({
      version: "sotto-human-wallet-capabilities-v1",
      approvalVersions: ["sotto-human-purchase-approval-v2"],
      connectorId: "wallet-sdk-human-reference",
      connectorKind: "wallet-sdk",
      explicitApproval: true,
      hashingSchemeVersions: ["HASHING_SCHEME_VERSION_V2"],
      networks: ["canton:devnet"],
      origin: "wallet://sotto-human-reference",
      packageIds: [FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID],
      payerParty: HUMAN_PAYER,
      preparedTransactionSigning: true,
      signingKey: {
        fingerprint: HUMAN_PAYER.split("::")[1],
        publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
        purpose: "SIGNING",
        signatureFormat: "SIGNATURE_FORMAT_CONCAT",
        signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
      },
      synchronizerIds: [HUMAN_SYNCHRONIZER],
    }),
    requestApproval:
      requestApproval ??
      (async () => {
        throw new Error("prepare-only flow must not request wallet approval");
      }),
  };
  const result = await createHumanWalletConnectorPreflight({
    connector,
    connectorId: "wallet-sdk-human-reference",
    connectorKind: "wallet-sdk",
    connectorOrigin: "wallet://sotto-human-reference",
    expectedPackageId: FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID,
    observePayerIdentity,
  });
  if (result.outcome !== "compatible") {
    throw new Error("test human wallet is incompatible");
  }
  return result;
}

function paymentRequiredResponse(): Response {
  const binding = `sha256:${"0".repeat(64)}`;
  return new Response(null, {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": Buffer.from(
        JSON.stringify({
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
                memo: binding,
                synchronizerId: HUMAN_SYNCHRONIZER,
              },
            },
          ],
        }),
      ).toString("base64"),
    },
  });
}

function preparedResponse(
  intent: HumanPurchaseLedgerIntent,
  request: Parameters<typeof humanPreparedPurchaseBytes>[1],
): Promise<Uint8Array> {
  const transaction = humanPreparedPurchaseBytes(intent, request);
  return recomputeWalletPreparedHashPrecheck(transaction).then((digest) =>
    new TextEncoder().encode(
      JSON.stringify({
        preparedTransaction: Buffer.from(transaction).toString("base64"),
        preparedTransactionHash: Buffer.from(digest).toString("base64"),
        hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
        hashingDetails: null,
        costEstimation: null,
      }),
    ),
  );
}

export function readersForHumanIntent(
  intent: HumanPurchaseLedgerIntent,
  events: string[],
): FiveNorthHumanPurchaseReaders {
  return {
    holdings: {
      readLedgerEnd: async () => {
        events.push("holdings-ledger-end");
        return { offset: 42 };
      },
      readActiveContracts: async () => {
        events.push("holdings-acs");
        return [
          humanHoldingEntry(
            "00holding-a",
            "0.3250000000",
            intent.challenge.payerParty,
            intent.challenge.synchronizerId,
          ),
        ];
      },
    },
    registry: async () => {
      events.push("registry");
      return responseBytes(externalFactoryResponse(intent as never));
    },
    prepared: async ({ body }) => {
      events.push("prepare");
      return preparedResponse(intent, body);
    },
  };
}

export async function humanPackageSelection(
  scope: PrepareOnlyHumanPackageSelectionScope,
) {
  const closure = buildFiveNorthHumanPackagePreferenceManifest();
  const candidate = {
    adminParty: scope.adminParty,
    challengeId: scope.challengeId,
    challengeObservedAt: scope.challengeObservedAt,
    closure,
    executeBefore: scope.executeBefore,
    providerParty: scope.providerParty,
    vettingValidAt: new Date(
      Date.parse(scope.challengeObservedAt) + 30_000,
    ).toISOString(),
    walletPreflight: scope.walletPreflight,
  };
  const observation = await createHumanPackagePreferenceObserver({
    readAuthenticatedSubject: async () => "validator-devnet-m2m",
    readPackageReferences: async () => [
      {
        packageId: FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID,
        packageName: "splice-amulet",
        packageVersion: "0.1.21",
      },
    ],
  })(candidate, { signal: scope.signal });
  return claimHumanPackagePreferenceObservation(observation, candidate);
}

export async function prepareOnlyHumanInput(
  events: string[],
  requestApproval?: HumanWalletConnector["requestApproval"],
): Promise<PrepareOnlyHumanPurchaseInput> {
  const preflight = await authenticatedHumanWalletPreflight(requestApproval);
  return {
    claimPackageSelection: humanPackageSelection,
    createReaders: (_signal, intent) => readersForHumanIntent(intent, events),
    createWalletPreflight: async () => {
      events.push("wallet-preflight");
      return preflight;
    },
    expectedProviderParty: PROVIDER,
    fetchAuthorized: async (request) => {
      events.push("payment-402");
      const binding = await import("@sotto/x402-canton").then(
        ({ commitHttpRequest }) =>
          commitHttpRequest({ method: request.method, url: request.url })
            .commitment,
      );
      const response = paymentRequiredResponse();
      const challenge = JSON.parse(
        Buffer.from(
          response.headers.get("PAYMENT-REQUIRED")!,
          "base64",
        ).toString("utf8"),
      );
      challenge.accepts[0].extra.memo = binding;
      return new Response(null, {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(challenge)).toString(
            "base64",
          ),
        },
      });
    },
    maximumFeeAtomic: HUMAN_PURCHASE_MAXIMUM_FEE_ATOMIC,
    recomputeOfficialHash: async (transaction) => {
      events.push("official-hash");
      return recomputeWalletPreparedHashPrecheck(transaction);
    },
    request: { method: "GET", url: RESOURCE_URL },
    trustedConfiguration: HUMAN_TOKEN_FACTORY_CONFIGURATION,
  };
}
