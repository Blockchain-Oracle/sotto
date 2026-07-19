import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import type { PreparedPurchaseShape } from "./prepared-purchase-shape.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

export type PreparedPurchaseState = Readonly<{
  capturedAt: number;
  intent: BoundedPurchaseLedgerIntent;
  prepareRequest: BoundedPurchasePrepareRequest;
  preparedTransaction: Uint8Array;
  preparedTransactionHash: string;
  shape: PreparedPurchaseShape;
}> & { claimed: boolean };

const states = new WeakMap<object, PreparedPurchaseState>();

function readState(candidate: unknown): PreparedPurchaseState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("prepared Purchase observation is not authenticated");
  }
  const state = states.get(candidate);
  if (state === undefined) {
    throw new Error("prepared Purchase observation is not authenticated");
  }
  return state;
}

export function registerPreparedPurchaseObservation(
  observation: object,
  state: PreparedPurchaseState,
): void {
  states.set(observation, state);
}

export function readPreparedPurchaseShape(
  candidate: unknown,
): PreparedPurchaseShape {
  return readState(candidate).shape;
}

export function claimPreparedPurchaseObservation(
  candidate: unknown,
): PreparedPurchaseState {
  const state = readState(candidate);
  if (state.claimed) {
    throw new Error("prepared Purchase observation is already claimed");
  }
  state.claimed = true;
  return state;
}
