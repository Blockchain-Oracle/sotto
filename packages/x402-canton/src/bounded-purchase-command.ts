import { atomicToDamlDecimal } from "./purchase-commitment-primitives.js";
import { mergePurchaseDisclosures } from "./purchase-disclosure-merge.js";
import {
  claimPurchaseHoldingObservation,
  readPurchaseHoldingObservation,
  type PurchaseHoldingObservation,
} from "./purchase-holding-observation.js";
import {
  readAuthenticatedBoundedPurchaseLedgerIntent,
  type BoundedPurchaseLedgerIntent,
} from "./purchase-ledger-intent.js";
import {
  claimTransferFactoryObservation,
  readTransferFactoryObservation,
  type TransferFactoryObservation,
} from "./transfer-factory-observation.js";
import type {
  BoundedPurchaseChoiceArgument,
  BoundedPurchasePrepareRequest,
} from "./bounded-purchase-command-types.js";

type PrepareRequestState = Readonly<{
  intent: BoundedPurchaseLedgerIntent;
}> & { claimed: boolean };

const prepareRequestStates = new WeakMap<object, PrepareRequestState>();

function purchaseChoiceArgument(
  intent: BoundedPurchaseLedgerIntent,
  holdingIds: readonly string[],
  context: BoundedPurchaseChoiceArgument["extraArgs"]["context"],
): BoundedPurchaseChoiceArgument {
  return Object.freeze({
    attemptId: intent.attemptId,
    purchaseCommitment: intent.purchaseCommitment,
    requestCommitment: intent.request.requestCommitment,
    challengeId: intent.challenge.challengeId,
    resourceHash: intent.capability.resourceHash,
    recipient: intent.challenge.recipientParty,
    amount: atomicToDamlDecimal(
      intent.challenge.amountAtomic,
      "purchase amount",
    ),
    requestedAt: intent.challenge.requestedAt,
    executeBefore: intent.challenge.executeBefore,
    inputHoldingCids: Object.freeze([...holdingIds]),
    extraArgs: Object.freeze({
      context,
      meta: Object.freeze({ values: Object.freeze({}) }),
    }),
    expectedRevision: intent.capability.expectedRevision,
  });
}

function constructRequest(
  intent: BoundedPurchaseLedgerIntent,
  holdingIds: readonly string[],
  context: BoundedPurchaseChoiceArgument["extraArgs"]["context"],
  disclosedContracts: BoundedPurchasePrepareRequest["disclosedContracts"],
): BoundedPurchasePrepareRequest {
  const exercise = Object.freeze({
    templateId: intent.capability.templateId,
    contractId: intent.capability.contractId,
    choice: "Purchase" as const,
    choiceArgument: purchaseChoiceArgument(intent, holdingIds, context),
  });
  return Object.freeze({
    commandId: `sotto-purchase-v2-${intent.purchaseCommitment.slice(7)}`,
    commands: Object.freeze([Object.freeze({ ExerciseCommand: exercise })]),
    actAs: Object.freeze([intent.capability.agentParty]) as readonly [string],
    readAs: Object.freeze([]) as readonly [],
    disclosedContracts,
    synchronizerId: intent.challenge.synchronizerId,
    packageIdSelectionPreference: Object.freeze([]) as readonly [],
    verboseHashing: false,
    prefetchContractKeys: Object.freeze([]) as readonly [],
    maxRecordTime: intent.challenge.executeBefore,
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
  });
}

export function buildBoundedPurchasePrepareRequest(
  candidateIntent: BoundedPurchaseLedgerIntent,
  holdingObservation: PurchaseHoldingObservation,
  registryObservation: TransferFactoryObservation,
): BoundedPurchasePrepareRequest {
  const intent = readAuthenticatedBoundedPurchaseLedgerIntent(candidateIntent);
  const holdings = readPurchaseHoldingObservation(holdingObservation, intent);
  const registry = readTransferFactoryObservation(
    registryObservation,
    intent,
    holdingObservation,
  );
  const disclosures = mergePurchaseDisclosures(
    holdings.disclosedContracts,
    registry.disclosedContracts,
  );
  const request = constructRequest(
    intent,
    holdings.contractIds,
    registry.choiceContextData,
    disclosures,
  );
  claimTransferFactoryObservation(
    registryObservation,
    intent,
    holdingObservation,
  );
  claimPurchaseHoldingObservation(holdingObservation, intent);
  prepareRequestStates.set(request, { intent, claimed: false });
  return request;
}

/** @internal Prepare transport only; a failed prepare requires reacquisition. */
export function claimBoundedPurchasePrepareRequest(
  candidate: unknown,
): Readonly<{
  intent: BoundedPurchaseLedgerIntent;
  request: BoundedPurchasePrepareRequest;
}> {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("bounded prepare request is not authenticated");
  }
  const state = prepareRequestStates.get(candidate);
  if (state === undefined) {
    throw new Error("bounded prepare request is not authenticated");
  }
  if (state.claimed)
    throw new Error("bounded prepare request is already claimed");
  state.claimed = true;
  return Object.freeze({
    intent: state.intent,
    request: candidate as BoundedPurchasePrepareRequest,
  });
}
