import type { CapabilityWalletApprovedSessionState } from "./capability-wallet-connector-types.js";

const states = new WeakMap<object, CapabilityWalletApprovedSessionState>();
const MAXIMUM_CLOCK_ROLLBACK_MS = 5_000;

export function registerApprovedCapabilityWalletSigningSession(
  session: object,
  state: CapabilityWalletApprovedSessionState,
): void {
  states.set(session, state);
}

function authenticatedState(
  candidate: unknown,
): CapabilityWalletApprovedSessionState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("approved capability wallet session is not authenticated");
  }
  const state = states.get(candidate);
  if (state === undefined) {
    throw new Error("approved capability wallet session is not authenticated");
  }
  const now = Date.now();
  if (now < state.createdAt - MAXIMUM_CLOCK_ROLLBACK_MS) {
    throw new Error("capability wallet signing session clock rollback");
  }
  if (now >= state.expiresAt) {
    throw new Error("approved capability wallet session has expired");
  }
  return state;
}

function snapshot(
  state: CapabilityWalletApprovedSessionState,
): CapabilityWalletApprovedSessionState {
  return {
    ...state,
    preparedTransaction: new Uint8Array(state.preparedTransaction),
  };
}

/** @internal Signature verification only. */
export function readApprovedCapabilityWalletSigningSession(
  candidate: unknown,
): CapabilityWalletApprovedSessionState {
  const state = authenticatedState(candidate);
  if (state.claimed) {
    throw new Error("approved capability wallet session is already claimed");
  }
  return snapshot(state);
}

/** @internal Signature verification only. */
export function claimApprovedCapabilityWalletSigningSession(
  candidate: unknown,
): CapabilityWalletApprovedSessionState {
  const state = authenticatedState(candidate);
  if (state.claimed) {
    throw new Error("approved capability wallet session is already claimed");
  }
  state.claimed = true;
  return snapshot(state);
}
