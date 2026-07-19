import { MIN_HUMAN_SIGNING_RESERVE_MS } from "./human-purchase-commitment-validation.js";
import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import type { PreparedPurchaseShape } from "./prepared-purchase-shape.js";

export const MAX_HUMAN_PREPARED_OBSERVATION_AGE_MS = 10_000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;

export type HumanPreparedPurchaseState = Readonly<{
  acquisitionStartedAt: number;
  capturedAt: number;
  intent: HumanPurchaseLedgerIntent;
  prepareRequest: HumanPurchasePrepareRequest;
  preparedTransaction: Uint8Array;
  participantPreparedTransactionHash: Uint8Array;
  shape: PreparedPurchaseShape;
}> & { claimed: boolean };

const states = new WeakMap<object, HumanPreparedPurchaseState>();

/** @internal Human prepared-state transitions only. */
export function assertHumanPreparedPurchaseStateFresh(
  state: HumanPreparedPurchaseState,
): void {
  const now = Date.now();
  if (
    state.capturedAt - state.acquisitionStartedAt >
      MAX_HUMAN_PREPARED_OBSERVATION_AGE_MS ||
    now - state.acquisitionStartedAt > MAX_HUMAN_PREPARED_OBSERVATION_AGE_MS
  ) {
    throw new Error("human prepared Purchase observation is stale");
  }
  if (
    state.capturedAt < state.acquisitionStartedAt ||
    now - state.capturedAt < -CLOCK_ROLLBACK_TOLERANCE_MS
  ) {
    throw new Error("human prepared Purchase clock moved backwards");
  }
  const remaining = Date.parse(state.intent.challenge.executeBefore) - now;
  if (remaining < MIN_HUMAN_SIGNING_RESERVE_MS) {
    throw new Error("human prepared Purchase lacks the signing reserve");
  }
}

function readState(candidate: unknown): HumanPreparedPurchaseState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("human prepared Purchase observation is not authenticated");
  }
  const state = states.get(candidate);
  if (state === undefined) {
    throw new Error("human prepared Purchase observation is not authenticated");
  }
  assertHumanPreparedPurchaseStateFresh(state);
  return state;
}

export function registerHumanPreparedPurchaseObservation(
  observation: object,
  state: HumanPreparedPurchaseState,
): void {
  assertHumanPreparedPurchaseStateFresh(state);
  states.set(observation, {
    ...state,
    preparedTransaction: new Uint8Array(state.preparedTransaction),
    participantPreparedTransactionHash: new Uint8Array(
      state.participantPreparedTransactionHash,
    ),
  });
}

/** @internal Official prepared-hash verification only. */
export function claimHumanPreparedPurchaseObservation(
  candidate: unknown,
): HumanPreparedPurchaseState {
  const state = readState(candidate);
  if (state.claimed) {
    throw new Error("human prepared Purchase observation is already claimed");
  }
  state.claimed = true;
  return Object.freeze({
    ...state,
    preparedTransaction: new Uint8Array(state.preparedTransaction),
    participantPreparedTransactionHash: new Uint8Array(
      state.participantPreparedTransactionHash,
    ),
  });
}
