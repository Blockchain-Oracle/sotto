import {
  type AuthenticatedHumanPackagePreference,
  type HumanPackagePreferenceObservation,
  type HumanPackagePreferenceReader,
  type HumanPackagePreferenceScope,
  type ValidatedHumanPackagePreferenceScope,
} from "./human-package-preference-types.js";
import { acquireHumanPackagePreference } from "./human-package-preference-acquisition.js";
import {
  validateHumanPackagePreferenceReader,
  validateHumanPackagePreferenceScope,
} from "./human-package-preference-validation.js";
import {
  withHumanObservationDeadline,
  type HumanObservationOptions,
} from "./human-observation-deadline.js";

export const MAX_HUMAN_PACKAGE_ACQUISITION_MS = 10_000;
export const MAX_HUMAN_PACKAGE_OBSERVATION_AGE_MS = 60_000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;

type ObservationState = {
  acquisitionStartedAt: number;
  capturedAt: number;
  claimed: boolean;
  projection: AuthenticatedHumanPackagePreference;
  scope: ValidatedHumanPackagePreferenceScope;
};

const observations = new WeakMap<object, ObservationState>();
const authenticated = new WeakMap<object, ObservationState>();

export type HumanPackagePreferenceObservationOptions = HumanObservationOptions;

function requireFresh(state: ObservationState): void {
  const now = Date.now();
  if (now - state.capturedAt < -CLOCK_ROLLBACK_TOLERANCE_MS) {
    throw new Error("human package preference clock moved backwards");
  }
  if (
    state.capturedAt - state.acquisitionStartedAt >
      MAX_HUMAN_PACKAGE_ACQUISITION_MS ||
    now - state.acquisitionStartedAt > MAX_HUMAN_PACKAGE_OBSERVATION_AGE_MS
  ) {
    throw new Error("human package preference is stale");
  }
}

function sameScope(
  left: ValidatedHumanPackagePreferenceScope,
  right: ValidatedHumanPackagePreferenceScope,
): boolean {
  return (
    left.closure === right.closure &&
    left.payerIdentity === right.payerIdentity &&
    left.adminParty === right.adminParty &&
    left.challengeId === right.challengeId &&
    left.providerParty === right.providerParty &&
    left.challengeObservedAt === right.challengeObservedAt &&
    left.executeBefore === right.executeBefore &&
    left.vettingValidAt === right.vettingValidAt
  );
}

export function createHumanPackagePreferenceObserver(
  candidate: HumanPackagePreferenceReader,
): (
  scope: HumanPackagePreferenceScope,
  options?: HumanPackagePreferenceObservationOptions,
) => Promise<HumanPackagePreferenceObservation> {
  const source = validateHumanPackagePreferenceReader(candidate);
  return async (candidateScope, options = {}) => {
    const scope = validateHumanPackagePreferenceScope(candidateScope);
    return await withHumanObservationDeadline(
      "human package preference",
      MAX_HUMAN_PACKAGE_ACQUISITION_MS,
      options,
      async (signal) => {
        const acquired = await acquireHumanPackagePreference(
          source,
          scope,
          signal,
        );
        const state = {
          acquisitionStartedAt: acquired.acquisitionStartedAt,
          capturedAt: acquired.capturedAt,
          claimed: false,
          projection: acquired.projection,
          scope,
        };
        requireFresh(state);
        observations.set(acquired.observation, state);
        return acquired.observation;
      },
    );
  };
}

export function claimHumanPackagePreferenceObservation(
  candidate: unknown,
  candidateScope: HumanPackagePreferenceScope,
): AuthenticatedHumanPackagePreference {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error(
      "human package preference observation is not authenticated",
    );
  }
  const state = observations.get(candidate);
  if (state === undefined) {
    throw new Error(
      "human package preference observation is not authenticated",
    );
  }
  const scope = validateHumanPackagePreferenceScope(candidateScope);
  if (!sameScope(state.scope, scope)) {
    throw new Error("human package preference claim scope does not match");
  }
  requireFresh(state);
  if (state.claimed) {
    throw new Error("human package preference is already claimed");
  }
  state.claimed = true;
  authenticated.set(state.projection, state);
  return state.projection;
}

export function readAuthenticatedHumanPackagePreference(
  candidate: unknown,
): AuthenticatedHumanPackagePreference {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("human package preference is not authenticated");
  }
  const state = authenticated.get(candidate);
  if (state === undefined) {
    throw new Error("human package preference is not authenticated");
  }
  requireFresh(state);
  return state.projection;
}

/** @internal Human purchase construction only. */
export function readHumanPackagePreferenceAuthority(candidate: unknown) {
  readAuthenticatedHumanPackagePreference(candidate);
  return authenticated.get(candidate as object)!.scope;
}
