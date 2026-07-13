import { randomBytes } from "node:crypto";
import { canonicalTime } from "./purchase-commitment-primitives.js";
import {
  readPurchaseHoldingObservation,
  type PurchaseHoldingObservation,
} from "./purchase-holding-observation.js";
import {
  readAuthenticatedBoundedPurchaseLedgerIntent,
  type BoundedPurchaseLedgerIntent,
} from "./purchase-ledger-intent.js";
import {
  buildTransferFactoryChoiceArguments,
  digestTransferFactoryChoiceArguments,
} from "./transfer-factory-choice.js";
import { parseTransferFactoryResponse } from "./transfer-factory-response.js";
import {
  MAX_REGISTRY_CONTEXT_BYTES,
  MAX_REGISTRY_RESPONSE_BYTES,
  REGISTRY_TIMEOUT_MS,
  TRANSFER_FACTORY_REGISTRY_PATH,
  type TransferFactoryExecutionMaterial,
  type TransferFactoryRegistryReader,
} from "./transfer-factory-types.js";
import { snapshotStrictJsonObject } from "./strict-json-value.js";

export const MAX_TRANSFER_FACTORY_OBSERVATION_AGE_MS = 60_000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;
const MINIMUM_EXECUTION_REMAINING_MS = 5_000;

declare const transferFactoryObservationBrand: unique symbol;
export type TransferFactoryObservation = Readonly<{
  observationId: `sha256:${string}`;
  observedAt: string;
  readonly [transferFactoryObservationBrand]: true;
}>;

type State = TransferFactoryExecutionMaterial & {
  capturedAt: number;
  claimed: boolean;
  attemptId: `sha256:${string}`;
  purchaseCommitment: `sha256:${string}`;
  holdingObservation: PurchaseHoldingObservation;
  executeBefore: string;
};
const states = new WeakMap<object, State>();

function cloneMaterial(state: State): TransferFactoryExecutionMaterial {
  return Object.freeze({
    factoryId: state.factoryId,
    transferKind: state.transferKind,
    choiceArgumentsDigest: state.choiceArgumentsDigest,
    choiceContextData: snapshotStrictJsonObject(
      state.choiceContextData,
      "TransferFactory choiceContextData",
      {
        maximumBytes: MAX_REGISTRY_CONTEXT_BYTES,
        maximumDepth: 16,
        maximumNodes: 2_048,
      },
    ),
    disclosedContracts: Object.freeze(
      state.disclosedContracts.map((contract) =>
        Object.freeze({ ...contract }),
      ),
    ),
  });
}

function readState(
  observation: unknown,
  candidateIntent: unknown,
  holdingObservation: unknown,
): State {
  const intent = readAuthenticatedBoundedPurchaseLedgerIntent(candidateIntent);
  const holdings = readPurchaseHoldingObservation(holdingObservation, intent);
  if (typeof observation !== "object" || observation === null) {
    throw new Error("TransferFactory observation is not authenticated");
  }
  const state = states.get(observation);
  if (state === undefined)
    throw new Error("TransferFactory observation is not authenticated");
  const age = Date.now() - state.capturedAt;
  if (age < -CLOCK_ROLLBACK_TOLERANCE_MS)
    throw new Error("TransferFactory observation clock moved backwards");
  if (age > MAX_TRANSFER_FACTORY_OBSERVATION_AGE_MS)
    throw new Error("TransferFactory observation is stale");
  if (
    Date.parse(state.executeBefore) - Date.now() <
    MINIMUM_EXECUTION_REMAINING_MS
  ) {
    throw new Error("TransferFactory execution window is too short");
  }
  const digest = digestTransferFactoryChoiceArguments(
    buildTransferFactoryChoiceArguments(intent, holdings),
  );
  if (
    state.purchaseCommitment !== intent.purchaseCommitment ||
    state.attemptId !== intent.attemptId
  ) {
    throw new Error(
      "TransferFactory observation belongs to a different purchase",
    );
  }
  if (
    state.holdingObservation !== holdingObservation ||
    state.choiceArgumentsDigest !== digest
  ) {
    throw new Error(
      "TransferFactory observation belongs to a different holding selection",
    );
  }
  return state;
}

export function createTransferFactoryObserver(
  reader: TransferFactoryRegistryReader,
): (
  intent: BoundedPurchaseLedgerIntent,
  holdings: PurchaseHoldingObservation,
) => Promise<TransferFactoryObservation> {
  return async (candidateIntent, holdingObservation) => {
    const intent =
      readAuthenticatedBoundedPurchaseLedgerIntent(candidateIntent);
    const holdings = readPurchaseHoldingObservation(holdingObservation, intent);
    const choiceArguments = buildTransferFactoryChoiceArguments(
      intent,
      holdings,
    );
    const choiceArgumentsDigest =
      digestTransferFactoryChoiceArguments(choiceArguments);
    const request = Object.freeze({
      registryAdmin: intent.challenge.instrument.admin,
      path: TRANSFER_FACTORY_REGISTRY_PATH,
      method: "POST" as const,
      contentType: "application/json" as const,
      redirect: "error" as const,
      timeoutMilliseconds: REGISTRY_TIMEOUT_MS,
      maximumResponseBytes: MAX_REGISTRY_RESPONSE_BYTES,
      body: JSON.stringify({ choiceArguments, excludeDebugFields: true }),
    });
    const acquisitionStartedAt = Date.now();
    const parsed = parseTransferFactoryResponse(
      await reader(request),
      intent,
      choiceArgumentsDigest,
    );
    const capturedAt = Date.now();
    const age = capturedAt - acquisitionStartedAt;
    if (age < -CLOCK_ROLLBACK_TOLERANCE_MS)
      throw new Error(
        "TransferFactory clock moved backwards during acquisition",
      );
    if (age > MAX_TRANSFER_FACTORY_OBSERVATION_AGE_MS)
      throw new Error("TransferFactory acquisition is stale");
    if (
      Date.parse(intent.challenge.executeBefore) - capturedAt <
      MINIMUM_EXECUTION_REMAINING_MS
    ) {
      throw new Error("TransferFactory execution window is too short");
    }
    const observedAt = new Date(capturedAt).toISOString();
    canonicalTime(observedAt, "TransferFactory observedAt");
    const observation = Object.freeze({
      observationId: `sha256:${randomBytes(32).toString("hex")}`,
      observedAt,
    }) as TransferFactoryObservation;
    states.set(observation, {
      ...parsed,
      capturedAt: acquisitionStartedAt,
      claimed: false,
      attemptId: intent.attemptId,
      purchaseCommitment: intent.purchaseCommitment,
      holdingObservation,
      executeBefore: intent.challenge.executeBefore,
    });
    return observation;
  };
}

/** @internal Command construction only. */
export function readTransferFactoryObservation(
  observation: unknown,
  intent: unknown,
  holdings: unknown,
): TransferFactoryExecutionMaterial {
  return cloneMaterial(readState(observation, intent, holdings));
}

/** @internal Command construction only; preparation failure requires reacquisition. */
export function claimTransferFactoryObservation(
  observation: unknown,
  intent: unknown,
  holdings: unknown,
): TransferFactoryExecutionMaterial {
  const state = readState(observation, intent, holdings);
  if (state.claimed)
    throw new Error("TransferFactory observation is already claimed");
  state.claimed = true;
  return cloneMaterial(state);
}
