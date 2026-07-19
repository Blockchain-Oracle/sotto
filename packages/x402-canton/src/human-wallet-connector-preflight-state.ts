import {
  readAuthenticatedHumanPayerIdentityAt,
  type AuthenticatedHumanPayerIdentity,
} from "./human-payer-identity.js";
import type {
  AuthenticatedHumanWalletConnectorPreflight,
  HumanWalletCapabilities,
  HumanWalletConnector,
} from "./human-wallet-connector-types.js";
import {
  MAX_HUMAN_WALLET_PREFLIGHT_ACQUISITION_MS,
  MAX_HUMAN_WALLET_PREFLIGHT_AGE_MS,
} from "./human-wallet-connector-types.js";
import { SHA256_PATTERN } from "./purchase-commitment-primitives.js";

const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;

export type HumanWalletConnectorPreflightAuthority = Readonly<{
  capabilities: HumanWalletCapabilities;
  connector: HumanWalletConnector;
  expectedPackageId: string;
  identity: AuthenticatedHumanPayerIdentity;
}>;

type PreflightState = {
  acquisitionStartedAt: number;
  authority: HumanWalletConnectorPreflightAuthority;
  capturedAt: number;
  projection: AuthenticatedHumanWalletConnectorPreflight;
  purchaseCommitment?: string;
  sessionClaimed: boolean;
};

const authenticatedPreflights = new WeakMap<object, PreflightState>();

function requireFresh(state: PreflightState, now: number): void {
  if (
    state.capturedAt - state.acquisitionStartedAt <
      -CLOCK_ROLLBACK_TOLERANCE_MS ||
    now - state.acquisitionStartedAt < -CLOCK_ROLLBACK_TOLERANCE_MS ||
    now - state.capturedAt < -CLOCK_ROLLBACK_TOLERANCE_MS
  ) {
    throw new Error("human wallet connector preflight clock moved backwards");
  }
  if (
    state.capturedAt - state.acquisitionStartedAt >
      MAX_HUMAN_WALLET_PREFLIGHT_ACQUISITION_MS ||
    now - state.acquisitionStartedAt > MAX_HUMAN_WALLET_PREFLIGHT_AGE_MS
  ) {
    throw new Error("human wallet connector preflight is stale");
  }
  readAuthenticatedHumanPayerIdentityAt(state.authority.identity, now);
}

function stateFor(candidate: unknown, now = Date.now()): PreflightState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("human wallet connector preflight is not authenticated");
  }
  const state = authenticatedPreflights.get(candidate);
  if (state === undefined) {
    throw new Error("human wallet connector preflight is not authenticated");
  }
  requireFresh(state, now);
  return state;
}

export function registerHumanWalletConnectorPreflight(input: {
  acquisitionStartedAt: number;
  capabilities: HumanWalletCapabilities;
  capturedAt: number;
  connector: HumanWalletConnector;
  expectedPackageId: string;
  identity: AuthenticatedHumanPayerIdentity;
  projection: AuthenticatedHumanWalletConnectorPreflight;
}): void {
  const state: PreflightState = {
    acquisitionStartedAt: input.acquisitionStartedAt,
    authority: Object.freeze({
      capabilities: input.capabilities,
      connector: input.connector,
      expectedPackageId: input.expectedPackageId,
      identity: input.identity,
    }),
    capturedAt: input.capturedAt,
    projection: input.projection,
    sessionClaimed: false,
  };
  requireFresh(state, Date.now());
  authenticatedPreflights.set(state.projection, state);
}

export function readAuthenticatedHumanWalletConnectorPreflight(
  candidate: unknown,
): AuthenticatedHumanWalletConnectorPreflight {
  return stateFor(candidate).projection;
}

/** @internal Human package and purchase authority only. */
export function readHumanWalletConnectorPreflightAuthority(
  candidate: unknown,
  now = Date.now(),
): HumanWalletConnectorPreflightAuthority {
  return stateFor(candidate, now).authority;
}

/** @internal Human purchase authority only. */
export function prepareHumanWalletConnectorPreflightBinding(
  candidate: unknown,
  purchaseCommitment: string,
  now = Date.now(),
) {
  if (!SHA256_PATTERN.test(purchaseCommitment)) {
    throw new Error("human wallet purchase commitment is invalid");
  }
  const state = stateFor(candidate, now);
  if (
    state.purchaseCommitment !== undefined &&
    state.purchaseCommitment !== purchaseCommitment
  ) {
    throw new Error("human wallet connector preflight is already bound");
  }
  return Object.freeze({
    authority: state.authority,
    commit: () => {
      if (
        state.purchaseCommitment !== undefined &&
        state.purchaseCommitment !== purchaseCommitment
      ) {
        throw new Error("human wallet connector preflight is already bound");
      }
      state.purchaseCommitment = purchaseCommitment;
    },
  });
}

/** @internal Human signing authority only. */
export function prepareHumanWalletConnectorPreflightSessionClaim(
  candidate: unknown,
  purchaseCommitment: string,
  now = Date.now(),
) {
  const state = stateFor(candidate, now);
  if (state.purchaseCommitment !== purchaseCommitment) {
    throw new Error("human wallet connector preflight purchase does not match");
  }
  if (state.sessionClaimed) {
    throw new Error("human wallet connector preflight is already claimed");
  }
  return Object.freeze({
    authority: state.authority,
    commit: () => {
      if (state.sessionClaimed) {
        throw new Error("human wallet connector preflight is already claimed");
      }
      state.sessionClaimed = true;
    },
  });
}
