import { MIN_HUMAN_SIGNING_RESERVE_MS } from "./human-purchase-commitment-validation.js";
import {
  readAuthenticatedHumanPurchaseLedgerIntent,
  type HumanPurchaseLedgerIntent,
} from "./human-purchase-ledger-intent.js";
import type {
  HumanPurchaseHoldingExecutionMaterial,
  HumanPurchaseHoldingObservation,
} from "./human-purchase-holding-types.js";
import type { SelectedPurchaseHolding } from "./purchase-holding-types.js";

export const MAX_HUMAN_HOLDING_ACQUISITION_MS = 10_000;
export const MAX_HUMAN_HOLDING_OBSERVATION_AGE_MS = 60_000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;

type HumanHoldingState = HumanPurchaseHoldingExecutionMaterial & {
  acquisitionStartedAt: number;
  capturedAt: number;
  claimed: boolean;
  intent: HumanPurchaseLedgerIntent;
};

const states = new WeakMap<object, HumanHoldingState>();

function requireTimes(
  intent: HumanPurchaseLedgerIntent,
  acquisitionStartedAt: number,
  capturedAt: number,
  now: number,
): void {
  if (
    capturedAt - acquisitionStartedAt < -CLOCK_ROLLBACK_TOLERANCE_MS ||
    now - capturedAt < -CLOCK_ROLLBACK_TOLERANCE_MS ||
    now - Date.parse(intent.challenge.requestedAt) <
      -CLOCK_ROLLBACK_TOLERANCE_MS
  ) {
    throw new Error("human holding observation clock moved backwards");
  }
  if (
    capturedAt - acquisitionStartedAt > MAX_HUMAN_HOLDING_ACQUISITION_MS ||
    now - acquisitionStartedAt > MAX_HUMAN_HOLDING_OBSERVATION_AGE_MS
  ) {
    throw new Error("human holding observation is stale");
  }
  if (now >= Date.parse(intent.challenge.executeBefore)) {
    throw new Error("human holding challenge is expired");
  }
}

export function requireHumanHoldingAcquisitionFresh(
  intent: HumanPurchaseLedgerIntent,
  acquisitionStartedAt: number,
  capturedAt = Date.now(),
): void {
  requireTimes(intent, acquisitionStartedAt, capturedAt, capturedAt);
}

function cloneMaterial(
  state: HumanHoldingState,
): HumanPurchaseHoldingExecutionMaterial {
  return Object.freeze({
    attemptId: state.attemptId,
    purchaseCommitment: state.purchaseCommitment,
    contractIds: Object.freeze([...state.contractIds]),
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
): HumanHoldingState {
  const intent = readAuthenticatedHumanPurchaseLedgerIntent(candidateIntent);
  if (typeof observation !== "object" || observation === null) {
    throw new Error("human holding observation is not authenticated");
  }
  const state = states.get(observation);
  if (state === undefined) {
    throw new Error("human holding observation is not authenticated");
  }
  requireTimes(
    state.intent,
    state.acquisitionStartedAt,
    state.capturedAt,
    Date.now(),
  );
  if (
    state.intent !== intent ||
    state.attemptId !== intent.attemptId ||
    state.purchaseCommitment !== intent.purchaseCommitment
  ) {
    throw new Error("human holding observation belongs to another purchase");
  }
  if (state.claimed) {
    throw new Error("human holding observation is already claimed");
  }
  return state;
}

export function bindHumanPurchaseHoldingObservation(
  observation: HumanPurchaseHoldingObservation,
  intent: HumanPurchaseLedgerIntent,
  acquisitionStartedAt: number,
  capturedAt: number,
  selected: readonly SelectedPurchaseHolding[],
): void {
  requireTimes(intent, acquisitionStartedAt, capturedAt, capturedAt);
  states.set(observation, {
    acquisitionStartedAt,
    capturedAt,
    claimed: false,
    intent,
    attemptId: intent.attemptId,
    purchaseCommitment: intent.purchaseCommitment,
    contractIds: Object.freeze(
      selected.map(({ disclosure }) => disclosure.contractId),
    ),
    disclosedContracts: Object.freeze(
      selected.map(({ disclosure }) => Object.freeze({ ...disclosure })),
    ),
  });
}

/** @internal Human registry and command construction only. */
export function readHumanPurchaseHoldingObservation(
  observation: unknown,
  intent: unknown,
): HumanPurchaseHoldingExecutionMaterial {
  return cloneMaterial(readState(observation, intent));
}

/** @internal Human command construction only. */
export function claimHumanPurchaseHoldingObservation(
  observation: unknown,
  intent: unknown,
): HumanPurchaseHoldingExecutionMaterial {
  const state = readState(observation, intent);
  if (
    Date.parse(state.intent.challenge.executeBefore) - Date.now() <
    MIN_HUMAN_SIGNING_RESERVE_MS
  ) {
    throw new Error("human holding challenge lacks the signing reserve");
  }
  state.claimed = true;
  return cloneMaterial(state);
}
