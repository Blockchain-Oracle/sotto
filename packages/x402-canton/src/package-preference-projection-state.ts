import { assertPackagePreferenceObservationFresh } from "./package-preference-observation-validation.js";
import {
  PACKAGE_SELECTION_VERSION,
  type AuthenticatedPackagePreferenceProjection,
} from "./package-preference-observation-types.js";
import {
  RAW_SHA256_PATTERN,
  SHA256_PATTERN,
  canonicalTime,
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";

type ProjectionState = Readonly<{
  acquisitionStartedAt: number;
  capturedAt: number;
  projection: AuthenticatedPackagePreferenceProjection;
}>;

const projectionStates = new WeakMap<object, ProjectionState>();

function boundedArray(value: unknown, label: string, maximum = 64): unknown[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > maximum ||
    Object.keys(value).length !== value.length
  ) {
    throw new Error(`${label} must be a non-empty bounded array`);
  }
  return value;
}

function sha256(value: unknown, label: string): `sha256:${string}` {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a SHA-256 identifier`);
  }
  return value as `sha256:${string}`;
}

function packageId(value: unknown, label: string): string {
  if (typeof value !== "string" || !RAW_SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase package ID`);
  }
  return value;
}

function snapshotReferences(value: unknown) {
  return Object.freeze(
    boundedArray(value, "package preference references").map(
      (candidate, index) => {
        const label = `package preference reference[${index}]`;
        const record = objectValue(candidate, label);
        exactKeys(
          record,
          ["packageId", "packageName", "packageVersion", "artifactIds"],
          label,
        );
        return Object.freeze({
          packageId: packageId(record.packageId, `${label} ID`),
          packageName: identifier(record.packageName, `${label} name`, 255),
          packageVersion: identifier(
            record.packageVersion,
            `${label} version`,
            128,
          ),
          artifactIds: Object.freeze(
            boundedArray(record.artifactIds, `${label} artifact IDs`).map(
              (entry, artifactIndex) =>
                identifier(
                  entry,
                  `${label} artifact ID[${artifactIndex}]`,
                  255,
                ),
            ),
          ),
        });
      },
    ),
  );
}

export function snapshotPackagePreferenceProjection(
  value: unknown,
): AuthenticatedPackagePreferenceProjection {
  const record = objectValue(value, "package preference projection");
  exactKeys(
    record,
    [
      "version",
      "observationId",
      "closureHash",
      "references",
      "packageIds",
      "parties",
      "synchronizerId",
      "vettingValidAt",
      "acquiredAt",
      "authenticatedSubject",
    ],
    "package preference projection",
  );
  if (record.version !== PACKAGE_SELECTION_VERSION) {
    throw new Error("package preference projection version is unsupported");
  }
  canonicalTime(record.vettingValidAt, "package preference vettingValidAt");
  canonicalTime(record.acquiredAt, "package preference acquiredAt");
  return Object.freeze({
    version: PACKAGE_SELECTION_VERSION,
    observationId: sha256(
      record.observationId,
      "package preference observationId",
    ),
    closureHash: sha256(record.closureHash, "package preference closureHash"),
    references: snapshotReferences(record.references),
    packageIds: Object.freeze(
      boundedArray(record.packageIds, "package preference package IDs").map(
        (entry, index) =>
          packageId(entry, `package preference package ID[${index}]`),
      ),
    ),
    parties: Object.freeze(
      boundedArray(record.parties, "package preference parties", 16).map(
        (entry, index) =>
          identifier(entry, `package preference party[${index}]`),
      ),
    ),
    synchronizerId: identifier(
      record.synchronizerId,
      "package preference synchronizer",
    ),
    vettingValidAt: record.vettingValidAt as string,
    acquiredAt: record.acquiredAt as string,
    authenticatedSubject: identifier(
      record.authenticatedSubject,
      "package preference authenticated subject",
      255,
    ),
  });
}

export function registerAuthenticatedPackagePreferenceProjection(
  value: unknown,
  acquisitionStartedAt: number,
  capturedAt: number,
): AuthenticatedPackagePreferenceProjection {
  const projection = snapshotPackagePreferenceProjection(value);
  projectionStates.set(projection, {
    acquisitionStartedAt,
    capturedAt,
    projection,
  });
  return projection;
}

export function readAuthenticatedPackagePreferenceProjection(
  value: unknown,
): AuthenticatedPackagePreferenceProjection {
  if (typeof value !== "object" || value === null) {
    throw new Error("package preference projection is not authenticated");
  }
  const state = projectionStates.get(value);
  if (state === undefined) {
    throw new Error("package preference projection is not authenticated");
  }
  assertPackagePreferenceObservationFresh(
    state.acquisitionStartedAt,
    state.capturedAt,
  );
  return snapshotPackagePreferenceProjection(state.projection);
}

/** @internal Test fixture only; not exported from the package entry point. */
export function capturePackagePreferenceProjectionForTest(
  value: unknown,
): AuthenticatedPackagePreferenceProjection {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("test-only package preference recorder is disabled");
  }
  const capturedAt = Date.now();
  return registerAuthenticatedPackagePreferenceProjection(
    value,
    capturedAt,
    capturedAt,
  );
}
