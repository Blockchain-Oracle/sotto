import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import {
  assertHumanPreparedPurchaseStateFresh,
  type HumanPreparedPurchaseState,
} from "./human-prepared-purchase-observation-state.js";
import type { PreparedPurchaseShape } from "./prepared-purchase-shape.js";
import { digestHumanTransferContext } from "./human-transfer-context-digest.js";

type VerifiedState = {
  claimed: boolean;
  prepared: HumanPreparedPurchaseState;
  preparedTransactionHash: Uint8Array;
  transferContextHash: `sha256:${string}`;
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
  transferContextHash: `sha256:${string}`;
}>;

export type ReadHashVerifiedHumanSettlementAuthority = Readonly<{
  intent: HumanPurchaseLedgerIntent;
  prepareRequest: HumanPurchasePrepareRequest;
}>;

const states = new WeakMap<object, VerifiedState>();
const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;

function assertHashVerifiedAuthorityActive(state: VerifiedState): void {
  const now = Date.now();
  if (
    !Number.isSafeInteger(state.verifiedAt) ||
    state.verifiedAt < state.prepared.capturedAt ||
    now < state.verifiedAt - CLOCK_ROLLBACK_TOLERANCE_MS
  ) {
    throw new Error("hash-verified human Purchase clock moved backwards");
  }
  const executeBefore = Date.parse(
    state.prepared.intent.challenge.executeBefore,
  );
  if (!Number.isSafeInteger(executeBefore) || executeBefore <= now) {
    throw new Error("hash-verified human Purchase has expired");
  }
}

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
  assertHashVerifiedAuthorityActive(state);
  return state;
}

export function registerHashVerifiedHumanPreparedPurchase(
  authority: object,
  prepared: HumanPreparedPurchaseState,
  preparedTransactionHash: Uint8Array,
  verifiedAt: number,
): void {
  assertHumanPreparedPurchaseStateFresh(prepared);
  const state: VerifiedState = {
    claimed: false,
    prepared,
    preparedTransactionHash: new Uint8Array(preparedTransactionHash),
    transferContextHash: digestHumanTransferContext(
      prepared.prepareRequest.commands[0].ExerciseCommand.choiceArgument
        .extraArgs.context,
    ),
    verifiedAt,
  };
  assertHashVerifiedAuthorityActive(state);
  states.set(authority, state);
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
    transferContextHash: state.transferContextHash,
  });
}

/** @internal Authenticated settlement-expectation projection only. */
export function readHashVerifiedHumanSettlementAuthority(
  candidate: unknown,
): ReadHashVerifiedHumanSettlementAuthority {
  const state = readState(candidate);
  return Object.freeze({
    intent: state.prepared.intent,
    prepareRequest: state.prepared.prepareRequest,
  });
}

/** @internal Human wallet-session construction only. */
export function claimHashVerifiedHumanPreparedPurchase(
  candidate: unknown,
): ClaimedHashVerifiedHumanPreparedPurchase {
  return prepareHashVerifiedHumanPreparedPurchaseClaim(candidate).commit();
}

/** @internal Human wallet-session construction only. */
export function prepareHashVerifiedHumanPreparedPurchaseClaim(
  candidate: unknown,
) {
  const state = readState(candidate);
  const snapshot = projectState(state);
  return Object.freeze({
    snapshot,
    commit: () => {
      if (state.claimed) {
        throw new Error("hash-verified human Purchase is already claimed");
      }
      state.claimed = true;
      return snapshot;
    },
  });
}
