import {
  buildBoundedPurchasePrepareRequest,
  commitBoundedPurchase,
  createPurchaseHoldingObserver,
  createTransferFactoryObserver,
  readBoundedPurchaseLedgerIntent,
  type AuthenticatedPackagePreferenceProjection,
  type BoundedPurchaseLedgerIntent,
  type BoundedPurchasePrepareRequest,
  type PurchaseHoldingObservation,
  type TransferFactoryObservation,
} from "../src/index.js";
import {
  createPurchaseInput,
  mutateChallenge,
} from "./purchase-commitment.fixtures.js";
import {
  holdingEntry,
  holdingReader,
} from "./purchase-holding-observation.fixtures.js";
import { createPackageSelectionFixture } from "./purchase-package-selection.fixtures.js";
import {
  factoryResponse,
  responseBytes,
} from "./transfer-factory-observation.fixtures.js";

export type PreferenceAwareCommandBuilder = (
  intent: BoundedPurchaseLedgerIntent,
  holdings: PurchaseHoldingObservation,
  registry: TransferFactoryObservation,
  packageSelection: AuthenticatedPackagePreferenceProjection,
) => BoundedPurchasePrepareRequest;

export const buildPreferenceAwareCommand =
  buildBoundedPurchasePrepareRequest as unknown as PreferenceAwareCommandBuilder;

type PreferenceExecution = Readonly<{
  holdings: PurchaseHoldingObservation;
  registry: TransferFactoryObservation;
}>;

type CommandPreferenceInputs = PreferenceExecution &
  Readonly<{
    intent: BoundedPurchaseLedgerIntent;
    packageSelection: AuthenticatedPackagePreferenceProjection;
  }>;

export async function executionFor(
  intent: BoundedPurchaseLedgerIntent,
): Promise<PreferenceExecution> {
  const holdings = await createPurchaseHoldingObserver(
    holdingReader([holdingEntry("00holding-a", "0.3250000000")]),
  )(intent);
  const registry = await createTransferFactoryObserver(async () =>
    responseBytes(factoryResponse(intent)),
  )(intent, holdings);
  return { holdings, registry };
}

export async function commandPreferenceInputs(
  packageSelection = createPackageSelectionFixture(),
  purchaseWindowSeconds = 45,
): Promise<CommandPreferenceInputs> {
  const projection =
    packageSelection as unknown as AuthenticatedPackagePreferenceProjection;
  const input = mutateChallenge(
    createPurchaseInput(packageSelection),
    (challenge) => {
      challenge.accepts[0]!.maxTimeoutSeconds = purchaseWindowSeconds;
      challenge.accepts[0]!.extra.executeBeforeSeconds = purchaseWindowSeconds;
    },
  );
  const intent = readBoundedPurchaseLedgerIntent(commitBoundedPurchase(input));
  return {
    intent,
    packageSelection: projection,
    ...(await executionFor(intent)),
  };
}
