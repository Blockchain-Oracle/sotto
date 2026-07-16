import { MIN_HUMAN_SIGNING_RESERVE_MS } from "./human-purchase-commitment-validation.js";
import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";

type HumanPurchasePrepareState = {
  claimed: boolean;
  intent: HumanPurchaseLedgerIntent;
  request: HumanPurchasePrepareRequest;
  requireAuthorityFresh: (now: number) => void;
};

const states = new WeakMap<object, HumanPurchasePrepareState>();

export function bindHumanPurchasePrepareRequest(
  request: HumanPurchasePrepareRequest,
  intent: HumanPurchaseLedgerIntent,
  requireAuthorityFresh: (now: number) => void,
): void {
  states.set(request, {
    claimed: false,
    intent,
    request,
    requireAuthorityFresh,
  });
}

function readState(candidate: unknown): HumanPurchasePrepareState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("human purchase prepare request is not authenticated");
  }
  const state = states.get(candidate);
  if (state === undefined) {
    throw new Error("human purchase prepare request is not authenticated");
  }
  if (state.claimed) {
    throw new Error("human purchase prepare request is already claimed");
  }
  const now = Date.now();
  state.requireAuthorityFresh(now);
  if (
    Date.parse(state.intent.challenge.executeBefore) - now <
    MIN_HUMAN_SIGNING_RESERVE_MS
  ) {
    throw new Error("human purchase prepare request lacks the signing reserve");
  }
  return state;
}

/** @internal Human prepare transport only. */
export function readHumanPurchasePrepareRequest(candidate: unknown) {
  const state = readState(candidate);
  return Object.freeze({ intent: state.intent, request: state.request });
}

/** @internal Human prepare transport only. */
export function claimHumanPurchasePrepareRequest(candidate: unknown) {
  const state = readState(candidate);
  state.claimed = true;
  return Object.freeze({ intent: state.intent, request: state.request });
}
