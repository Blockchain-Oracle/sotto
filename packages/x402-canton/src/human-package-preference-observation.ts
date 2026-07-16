import { createHash, randomBytes } from "node:crypto";
import {
  HUMAN_PACKAGE_SELECTION_VERSION,
  type AuthenticatedHumanPackagePreference,
  type HumanPackagePreferenceObservation,
  type HumanPackagePreferenceReader,
  type HumanPackagePreferenceScope,
  type ValidatedHumanPackagePreferenceScope,
} from "./human-package-preference-types.js";
import {
  validateHumanPackagePreferenceReader,
  validateHumanPackagePreferenceScope,
} from "./human-package-preference-validation.js";
import { verifyReviewedPackageReferences } from "./package-reference-verifier.js";
import { identifier } from "./purchase-commitment-primitives.js";

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

async function readUpstream(
  phase: "packages" | "subject",
  read: () => Promise<unknown>,
): Promise<unknown> {
  try {
    return await read();
  } catch {
    throw new Error(`human package preference ${phase} read failed`);
  }
}

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
) => Promise<HumanPackagePreferenceObservation> {
  const source = validateHumanPackagePreferenceReader(candidate);
  return async (candidateScope) => {
    const scope = validateHumanPackagePreferenceScope(candidateScope);
    const acquisitionStartedAt = Date.now();
    const initialSubject = identifier(
      await readUpstream("subject", () => source.readAuthenticatedSubject()),
      "human package authenticated subject",
      256,
    );
    const response = await readUpstream("packages", () =>
      source.readPackageReferences({
        packageRequirements: Object.freeze([
          Object.freeze({
            packageName: "splice-amulet",
            parties: scope.parties,
          }),
        ]),
        synchronizerId: scope.synchronizerId,
        vettingValidAt: scope.vettingValidAt,
      }),
    );
    const finalSubject = identifier(
      await readUpstream("subject", () => source.readAuthenticatedSubject()),
      "human package authenticated subject",
      256,
    );
    if (initialSubject !== finalSubject) {
      throw new Error("human package authenticated subject changed");
    }
    const references = verifyReviewedPackageReferences(scope.closure, response);
    const reference = references[0];
    if (references.length !== 1 || reference?.packageName !== "splice-amulet") {
      throw new Error("human package response must select only splice-amulet");
    }
    const capturedAt = Date.now();
    const acquiredAt = new Date(capturedAt).toISOString();
    const observationId = `sha256:${randomBytes(32).toString("hex")}` as const;
    const projection = Object.freeze({
      acquiredAt,
      closureHash: scope.closure.closureHash,
      observationId,
      packageIds: Object.freeze([reference.packageId]) as readonly [string],
      parties: scope.parties,
      references: Object.freeze([
        Object.freeze({
          artifactIds: Object.freeze([...reference.artifactIds]),
          packageId: reference.packageId,
          packageName: "splice-amulet" as const,
          packageVersion: reference.packageVersion,
        }),
      ]) as AuthenticatedHumanPackagePreference["references"],
      subjectHash: `sha256:${createHash("sha256")
        .update(initialSubject)
        .digest("hex")}` as const,
      synchronizerId: scope.synchronizerId,
      version: HUMAN_PACKAGE_SELECTION_VERSION,
      vettingValidAt: scope.vettingValidAt,
    });
    const observation = Object.freeze({
      observationId,
      observedAt: acquiredAt,
    });
    const state = {
      acquisitionStartedAt,
      capturedAt,
      claimed: false,
      projection,
      scope,
    };
    requireFresh(state);
    observations.set(observation, state);
    return observation;
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
