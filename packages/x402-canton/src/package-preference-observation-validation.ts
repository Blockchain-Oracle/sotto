import { utf8Compare } from "./package-preference-artifact-validation.js";
import {
  requireReviewedPackagePreferenceClosure,
  type ReviewedPackagePreferenceClosure,
} from "./package-preference-closure.js";
import type {
  PackagePreferenceClaimScope,
  PackagePreferenceObservationScope,
} from "./package-preference-observation-types.js";
import {
  canonicalTime,
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";

export const REQUIRED_PACKAGE_NAMES = Object.freeze([
  "sotto-control",
  "splice-amulet",
]);
export const MAX_PACKAGE_PREFERENCE_ACQUISITION_MS = 10_000;
export const MAX_PACKAGE_PREFERENCE_OBSERVATION_AGE_MS = 60_000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;

export type ValidatedObservationScope = Readonly<{
  closure: ReviewedPackagePreferenceClosure;
  parties: ReadonlyArray<string>;
  synchronizerId: string;
  vettingValidAt: string;
}>;

export type ValidatedClaimScope = Readonly<{
  closure: ReviewedPackagePreferenceClosure;
  synchronizerId: string;
  vettingValidAt: string;
  authenticatedSubject: string;
}>;

function canonicalTimestamp(value: unknown, label: string): string {
  canonicalTime(value, label);
  return value as string;
}

function requireExactPackageNames(
  closure: ReviewedPackagePreferenceClosure,
): void {
  if (
    JSON.stringify(closure.selectablePackageNames) !==
    JSON.stringify(REQUIRED_PACKAGE_NAMES)
  ) {
    throw new Error(
      "package preference observation requires the exact reviewed names",
    );
  }
}

export function assertPackagePreferenceAcquisitionWindow(
  acquisitionStartedAt: number,
  capturedAt: number,
): void {
  const duration = capturedAt - acquisitionStartedAt;
  if (duration < -CLOCK_ROLLBACK_TOLERANCE_MS) {
    throw new Error("package preference acquisition clock moved backwards");
  }
  if (duration > MAX_PACKAGE_PREFERENCE_ACQUISITION_MS) {
    throw new Error("package preference acquisition exceeded its time limit");
  }
}

export function assertPackagePreferenceObservationFresh(
  acquisitionStartedAt: number,
  capturedAt: number,
): void {
  const now = Date.now();
  if (now - capturedAt < -CLOCK_ROLLBACK_TOLERANCE_MS) {
    throw new Error("package preference observation clock moved backwards");
  }
  if (now - acquisitionStartedAt > MAX_PACKAGE_PREFERENCE_OBSERVATION_AGE_MS) {
    throw new Error("package preference observation is stale");
  }
}

export function validateObservationScope(
  value: PackagePreferenceObservationScope,
): ValidatedObservationScope {
  const record = objectValue(value, "package preference observation scope");
  exactKeys(
    record,
    [
      "closure",
      "synchronizerId",
      "vettingValidAt",
      "payerParty",
      "agentParty",
      "providerParty",
      "adminParty",
    ],
    "package preference observation scope",
  );
  const closure = requireReviewedPackagePreferenceClosure(record.closure);
  requireExactPackageNames(closure);
  const parties = Object.freeze(
    [
      identifier(record.payerParty, "package preference payer party"),
      identifier(record.agentParty, "package preference agent party"),
      identifier(record.providerParty, "package preference provider party"),
      identifier(record.adminParty, "package preference admin party"),
    ]
      .filter((party, index, values) => values.indexOf(party) === index)
      .sort(utf8Compare),
  );
  return Object.freeze({
    closure,
    parties,
    synchronizerId: identifier(
      record.synchronizerId,
      "package preference synchronizer",
    ),
    vettingValidAt: canonicalTimestamp(
      record.vettingValidAt,
      "package preference vettingValidAt",
    ),
  });
}

export function validateClaimScope(
  value: PackagePreferenceClaimScope,
): ValidatedClaimScope {
  const record = objectValue(value, "package preference claim scope");
  exactKeys(
    record,
    ["closure", "synchronizerId", "vettingValidAt", "authenticatedSubject"],
    "package preference claim scope",
  );
  const closure = requireReviewedPackagePreferenceClosure(record.closure);
  requireExactPackageNames(closure);
  return Object.freeze({
    closure,
    synchronizerId: identifier(
      record.synchronizerId,
      "package preference claim synchronizer",
    ),
    vettingValidAt: canonicalTimestamp(
      record.vettingValidAt,
      "package preference claim vettingValidAt",
    ),
    authenticatedSubject: identifier(
      record.authenticatedSubject,
      "package preference authenticated subject",
      255,
    ),
  });
}
