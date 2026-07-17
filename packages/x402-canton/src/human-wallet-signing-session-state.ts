import type { HumanWalletSignatureEnvelope } from "./human-wallet-signing-types.js";
import type { VerifiedHumanWalletSigningSession } from "./human-wallet-signing-types.js";

export type VerifiedHumanWalletSigningClaim = Readonly<{
  connectorId: string;
  connectorKind: "openrpc" | "wallet-sdk";
  network: `canton:${string}`;
  origin: string;
  packageId: string;
  party: string;
  preparedTransaction: Uint8Array;
  preparedTransactionHash: `sha256:${string}`;
  purchaseCommitment: `sha256:${string}`;
  sessionId: `sha256:${string}`;
  signature: HumanWalletSignatureEnvelope;
  synchronizerId: string;
}>;

type VerifiedState = VerifiedHumanWalletSigningClaim & {
  claimed: boolean;
  createdAt: number;
  expiresAt: number;
};

const states = new WeakMap<object, VerifiedState>();
const MAXIMUM_CLOCK_ROLLBACK_MS = 5_000;

function activeState(candidate: unknown): VerifiedState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("verified human wallet session is not authenticated");
  }
  const state = states.get(candidate);
  if (state === undefined) {
    throw new Error("verified human wallet session is not authenticated");
  }
  const now = Date.now();
  if (now < state.createdAt - MAXIMUM_CLOCK_ROLLBACK_MS) {
    throw new Error("verified human wallet session clock moved backwards");
  }
  if (now >= state.expiresAt) {
    throw new Error("verified human wallet session has expired");
  }
  if (state.claimed) {
    throw new Error("verified human wallet session is already claimed");
  }
  return state;
}

function snapshot(state: VerifiedState): VerifiedHumanWalletSigningClaim {
  return Object.freeze({
    connectorId: state.connectorId,
    connectorKind: state.connectorKind,
    network: state.network,
    origin: state.origin,
    packageId: state.packageId,
    party: state.party,
    preparedTransaction: new Uint8Array(state.preparedTransaction),
    preparedTransactionHash: state.preparedTransactionHash,
    purchaseCommitment: state.purchaseCommitment,
    sessionId: state.sessionId,
    signature: state.signature,
    synchronizerId: state.synchronizerId,
  });
}

export function registerVerifiedHumanWalletSigningSession(
  session: VerifiedHumanWalletSigningSession,
  state: Omit<VerifiedState, "claimed">,
): void {
  states.set(session, {
    ...state,
    claimed: false,
    preparedTransaction: new Uint8Array(state.preparedTransaction),
  });
}

/** @internal Human execute transport only. */
export function claimVerifiedHumanWalletSigningSession(
  candidate: unknown,
): VerifiedHumanWalletSigningClaim {
  const state = activeState(candidate);
  state.claimed = true;
  return snapshot(state);
}
