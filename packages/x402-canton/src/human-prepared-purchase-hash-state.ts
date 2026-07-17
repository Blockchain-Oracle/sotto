import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import {
  assertHumanPreparedPurchaseStateFresh,
  type HumanPreparedPurchaseState,
} from "./human-prepared-purchase-observation-state.js";
import type { PreparedPurchaseShape } from "./prepared-purchase-shape.js";

type VerifiedState = {
  claimed: boolean;
  prepared: HumanPreparedPurchaseState;
  preparedTransactionHash: Uint8Array;
  verifiedAt: number;
};

export type ClaimedHashVerifiedHumanPreparedPurchase = Readonly<{
  capturedAt: number;
  verifiedAt: number;
  intent: HumanPurchaseLedgerIntent;
  prepareRequest: HumanPurchasePrepareRequest;
  preparedTransaction: Uint8Array;
  preparedTransactionHash: Uint8Array;
  shape: PreparedPurchaseShape;
}>;

export type ReadHashVerifiedHumanPreparedPurchase = Readonly<{
  capturedAt: number;
  verifiedAt: number;
  intent: HumanPurchaseLedgerIntent;
  preparedTransactionHash: Uint8Array;
}>;

const states = new WeakMap<object, VerifiedState>();

function readState(candidate: unknown): VerifiedState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("hash-verified human Purchase is not authenticated");
  }
  const state = states.get(candidate);
  if (state === undefined) {
    throw new Error("hash-verified human Purchase is not authenticated");
  }
  if (state.claimed) {
    throw new Error("hash-verified human Purchase is already claimed");
  }
  assertHumanPreparedPurchaseStateFresh(state.prepared);
  return state;
}

export function registerHashVerifiedHumanPreparedPurchase(
  authority: object,
  prepared: HumanPreparedPurchaseState,
  preparedTransactionHash: Uint8Array,
  verifiedAt: number,
): void {
  assertHumanPreparedPurchaseStateFresh(prepared);
  states.set(authority, {
    claimed: false,
    prepared,
    preparedTransactionHash: new Uint8Array(preparedTransactionHash),
    verifiedAt,
  });
}

function projectState(
  state: VerifiedState,
): ClaimedHashVerifiedHumanPreparedPurchase {
  return Object.freeze({
    capturedAt: state.prepared.capturedAt,
    verifiedAt: state.verifiedAt,
    intent: state.prepared.intent,
    prepareRequest: state.prepared.prepareRequest,
    preparedTransaction: new Uint8Array(state.prepared.preparedTransaction),
    preparedTransactionHash: new Uint8Array(state.preparedTransactionHash),
    shape: state.prepared.shape,
  });
}

/** @internal Human approval projection and wallet-session construction only. */
export function readHashVerifiedHumanPreparedPurchase(
  candidate: unknown,
): ReadHashVerifiedHumanPreparedPurchase {
  const state = readState(candidate);
  return Object.freeze({
    capturedAt: state.prepared.capturedAt,
    verifiedAt: state.verifiedAt,
    intent: state.prepared.intent,
    preparedTransactionHash: new Uint8Array(state.preparedTransactionHash),
  });
}

/** @internal Human wallet-session construction only. */
export function claimHashVerifiedHumanPreparedPurchase(
  candidate: unknown,
): ClaimedHashVerifiedHumanPreparedPurchase {
  const state = readState(candidate);
  state.claimed = true;
  return projectState(state);
}
