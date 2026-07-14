import { randomBytes } from "node:crypto";
import { utf8Compare } from "./package-preference-artifact-validation.js";
import {
  assertPackagePreferenceAcquisitionWindow,
  assertPackagePreferenceObservationFresh,
  REQUIRED_PACKAGE_NAMES,
  validateClaimScope,
  validateObservationScope,
} from "./package-preference-observation-validation.js";
import {
  PACKAGE_SELECTION_VERSION,
  type AuthenticatedPackagePreferenceProjection,
  type PackagePreferenceClaimScope,
  type PackagePreferenceObservation,
  type PackagePreferenceObservationScope,
  type PackagePreferenceReader,
  type PackagePreferenceReadRequest,
} from "./package-preference-observation-types.js";
import { verifyReviewedPackageReferences } from "./package-reference-verifier.js";
import {
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";

type ObservationState = {
  readonly acquisitionStartedAt: number;
  readonly capturedAt: number;
  readonly projection: AuthenticatedPackagePreferenceProjection;
  claimed: boolean;
};

const observationStates = new WeakMap<object, ObservationState>();

function validateReader(
  value: PackagePreferenceReader,
): PackagePreferenceReader {
  const record = objectValue(value, "package preference reader");
  exactKeys(
    record,
    ["readAuthenticatedSubject", "readPackageReferences"],
    "package preference reader",
  );
  if (
    typeof record.readAuthenticatedSubject !== "function" ||
    typeof record.readPackageReferences !== "function"
  ) {
    throw new Error("package preference reader functions are required");
  }
  return value;
}

function buildRequest(
  parties: ReadonlyArray<string>,
  synchronizerId: string,
  vettingValidAt: string,
): PackagePreferenceReadRequest {
  return Object.freeze({
    packageRequirements: Object.freeze(
      REQUIRED_PACKAGE_NAMES.map((packageName) =>
        Object.freeze({ packageName, parties: Object.freeze([...parties]) }),
      ),
    ),
    synchronizerId,
    vettingValidAt,
  });
}

function cloneProjection(
  projection: AuthenticatedPackagePreferenceProjection,
): AuthenticatedPackagePreferenceProjection {
  return Object.freeze({
    ...projection,
    references: Object.freeze(
      projection.references.map((reference) =>
        Object.freeze({
          ...reference,
          artifactIds: Object.freeze([...reference.artifactIds]),
        }),
      ),
    ),
    packageIds: Object.freeze([...projection.packageIds]),
    parties: Object.freeze([...projection.parties]),
  });
}

function readState(observation: unknown): ObservationState {
  if (typeof observation !== "object" || observation === null) {
    throw new Error("package preference observation is not authenticated");
  }
  const state = observationStates.get(observation);
  if (state === undefined) {
    throw new Error("package preference observation is not authenticated");
  }
  return state;
}

export function createPackagePreferenceObserver(
  candidateReader: PackagePreferenceReader,
): (
  scope: PackagePreferenceObservationScope,
) => Promise<PackagePreferenceObservation> {
  const reader = validateReader(candidateReader);
  return async (candidateScope) => {
    const scope = validateObservationScope(candidateScope);
    const acquisitionStartedAt = Date.now();
    const initialSubject = identifier(
      await reader.readAuthenticatedSubject(),
      "package preference authenticated subject",
      255,
    );
    const response = await reader.readPackageReferences(
      buildRequest(scope.parties, scope.synchronizerId, scope.vettingValidAt),
    );
    const finalSubject = identifier(
      await reader.readAuthenticatedSubject(),
      "package preference authenticated subject",
      255,
    );
    if (initialSubject !== finalSubject) {
      throw new Error("package preference authenticated subject changed");
    }
    const references = verifyReviewedPackageReferences(scope.closure, response);
    if (
      JSON.stringify(references.map(({ packageName }) => packageName)) !==
      JSON.stringify(REQUIRED_PACKAGE_NAMES)
    ) {
      throw new Error(
        "package preference response must select each exact name",
      );
    }
    const capturedAt = Date.now();
    assertPackagePreferenceAcquisitionWindow(acquisitionStartedAt, capturedAt);
    const acquiredAt = new Date(capturedAt).toISOString();
    const projection = cloneProjection({
      version: PACKAGE_SELECTION_VERSION,
      closureHash: scope.closure.closureHash,
      references,
      packageIds: [...references.map(({ packageId }) => packageId)].sort(
        utf8Compare,
      ),
      parties: scope.parties,
      synchronizerId: scope.synchronizerId,
      vettingValidAt: scope.vettingValidAt,
      acquiredAt,
      authenticatedSubject: initialSubject,
    });
    const observation = Object.freeze({
      observationId: `sha256:${randomBytes(32).toString("hex")}`,
      observedAt: acquiredAt,
    }) as PackagePreferenceObservation;
    observationStates.set(observation, {
      acquisitionStartedAt,
      capturedAt,
      projection,
      claimed: false,
    });
    return observation;
  };
}

export function claimPackagePreferenceObservation(
  observation: unknown,
  candidateScope: PackagePreferenceClaimScope,
): AuthenticatedPackagePreferenceProjection {
  const state = readState(observation);
  const scope = validateClaimScope(candidateScope);
  if (
    scope.closure.closureHash !== state.projection.closureHash ||
    scope.synchronizerId !== state.projection.synchronizerId ||
    scope.vettingValidAt !== state.projection.vettingValidAt ||
    scope.authenticatedSubject !== state.projection.authenticatedSubject
  ) {
    throw new Error("package preference claim does not match its observation");
  }
  assertPackagePreferenceObservationFresh(
    state.acquisitionStartedAt,
    state.capturedAt,
  );
  if (state.claimed) {
    throw new Error("package preference observation is already claimed");
  }
  state.claimed = true;
  return cloneProjection(state.projection);
}

export {
  MAX_PACKAGE_PREFERENCE_ACQUISITION_MS,
  MAX_PACKAGE_PREFERENCE_OBSERVATION_AGE_MS,
} from "./package-preference-observation-validation.js";

export type {
  AuthenticatedPackagePreferenceProjection,
  PackagePreferenceClaimScope,
  PackagePreferenceObservation,
  PackagePreferenceObservationScope,
  PackagePreferenceReader,
  PackagePreferenceReadRequest,
} from "./package-preference-observation-types.js";
