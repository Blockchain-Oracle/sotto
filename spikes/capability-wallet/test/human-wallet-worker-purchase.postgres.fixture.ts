import {
  commitHttpRequest,
  createHumanPaymentObserver,
  createHumanPurchaseCommitter,
  readHumanPurchaseLedgerIntent,
  type HumanPreparedPurchaseReader,
  type HumanPurchaseHoldingReader,
  type HumanPurchaseLedgerIntent,
  type HumanPurchasePrepareRequest,
  type HumanTransferFactoryRegistryReader,
} from "@sotto/x402-canton";
import type { HumanPrepareAuthorityRestoreInput } from "@sotto/x402-canton/internal/human-prepare-authority-persistence";
import { historicalContextFactoryResponse } from "../../../packages/x402-canton/test/human-prepared-purchase.fixtures.js";
import {
  humanHoldingEntry,
  humanHoldingReader,
} from "../../../packages/x402-canton/test/human-purchase-holding.fixtures.js";
import { responseBytes } from "../../../packages/x402-canton/test/transfer-factory-observation.fixtures.js";
import {
  ADMIN,
  PROVIDER,
  spliceClosure,
  SYNCHRONIZER,
} from "../../../packages/database/test/purchase-authenticated-intent.fixture.js";
import { PURCHASE_RESOURCE_URL } from "../../../packages/database/test/purchase-journal.fixtures.js";
import { recomputeReferenceWalletPreparedHash } from "../src/index.js";
import { claimRealHumanPackageSelection } from "./human-wallet-worker-package.postgres.fixture.js";
import {
  cantonContractId,
  LEGACY_CONTEXT_IDS,
  rewriteStrings,
  sdkCompatiblePreparedTransaction,
} from "./human-wallet-worker-prepared.postgres.fixture.js";
import type { RealWalletProcessFixture } from "./human-wallet-worker-wallet.postgres.fixture.js";

export type RealWalletPurchaseContext = Readonly<{
  intent: HumanPurchaseLedgerIntent;
  createAuthority(): Promise<HumanPrepareAuthorityRestoreInput>;
  readers: Readonly<{
    holdings: HumanPurchaseHoldingReader;
    registry: HumanTransferFactoryRegistryReader;
    prepared: HumanPreparedPurchaseReader;
  }>;
}>;

export async function realWalletPurchaseContext(
  wallet: RealWalletProcessFixture,
): Promise<RealWalletPurchaseContext> {
  const closure = spliceClosure();
  const reference = closure.graphPackages.find(
    ({ name }) => name === "splice-amulet",
  );
  if (reference === undefined) throw new Error("Splice package is absent");
  const walletPreflight = await wallet.createPreflight(reference.packageId);
  const request = { method: "GET", url: PURCHASE_RESOURCE_URL };
  const binding = commitHttpRequest(request);
  const challenge = {
    x402Version: 2,
    resource: { url: PURCHASE_RESOURCE_URL },
    accepts: [
      {
        scheme: "exact",
        network: "canton:devnet",
        amount: "2500000000",
        asset: "CC",
        payTo: PROVIDER,
        maxTimeoutSeconds: 300,
        extra: {
          assetTransferMethod: "transfer-factory",
          executeBeforeSeconds: 300,
          feePayer: wallet.payerParty,
          instrumentId: { admin: ADMIN, id: "Amulet" },
          memo: binding.commitment,
          synchronizerId: SYNCHRONIZER,
        },
      },
    ],
  };
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
  const packageScope = {
    adminParty: ADMIN,
    challengeId: payment.challengeId,
    challengeObservedAt: payment.observedAt,
    closure,
    executeBefore: new Date(
      Date.parse(payment.observedAt) + 300_000,
    ).toISOString(),
    providerParty: PROVIDER,
    vettingValidAt: new Date(
      Date.parse(payment.observedAt) + 30_000,
    ).toISOString(),
    walletPreflight,
  };
  const packageSelection = await claimRealHumanPackageSelection(
    reference,
    packageScope,
  );
  const trustedConfiguration = Object.freeze({
    contractId: cantonContractId("token-factory"),
    expectedAsset: "CC",
    expectedAdmin: ADMIN,
    expectedInstrumentId: "Amulet",
    maximumAllowedFeeAtomic: "1000000000",
  });
  const intent = readHumanPurchaseLedgerIntent(
    createHumanPurchaseCommitter(trustedConfiguration)({
      maximumFeeAtomic: "750000000",
      packageSelection,
      paymentObservation: payment,
      walletPreflight,
    }),
  );
  const contextIds: ReadonlyMap<string, string> = new Map([
    ...LEGACY_CONTEXT_IDS.map(
      (legacy) => [legacy, cantonContractId(legacy)] as const,
    ),
    ["00holding-a", cantonContractId("00holding-a")],
  ]);
  const holdingId = contextIds.get("00holding-a")!;

  return Object.freeze({
    intent,
    createAuthority: async () => {
      const preflight = await wallet.createPreflight(reference.packageId);
      const scope = {
        adminParty: intent.challenge.instrument.admin,
        challengeId: intent.challenge.challengeId,
        challengeObservedAt: intent.challenge.requestedAt,
        closure,
        executeBefore: intent.challenge.executeBefore,
        providerParty: intent.challenge.recipientParty,
        vettingValidAt: intent.packageSelection.vettingValidAt,
        walletPreflight: preflight,
      };
      return Object.freeze({
        packageSelection: await claimRealHumanPackageSelection(
          reference,
          scope,
        ),
        trustedConfiguration,
        walletPreflight: preflight,
      });
    },
    readers: {
      holdings: humanHoldingReader([
        humanHoldingEntry(
          holdingId,
          "0.3250000000",
          intent.challenge.payerParty,
          intent.challenge.synchronizerId,
        ),
      ]),
      registry: async () => {
        const response = structuredClone(
          historicalContextFactoryResponse(intent),
        );
        rewriteStrings(response, (value) => contextIds.get(value) ?? value);
        return responseBytes(response);
      },
      prepared: async ({ body }: { body: HumanPurchasePrepareRequest }) => {
        const transaction = sdkCompatiblePreparedTransaction(
          intent,
          body,
          contextIds,
        );
        const digest = await recomputeReferenceWalletPreparedHash(transaction);
        return responseBytes({
          preparedTransaction: Buffer.from(transaction).toString("base64"),
          preparedTransactionHash: Buffer.from(digest).toString("base64"),
          hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
          hashingDetails: null,
          costEstimation: null,
        });
      },
    },
  });
}
