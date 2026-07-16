import { utf8Compare } from "./package-preference-artifact-validation.js";
import {
  readAuthenticatedHumanPackagePreference,
  readHumanPackagePreferenceAuthority,
} from "./human-package-preference-observation.js";
import { HUMAN_PACKAGE_SELECTION_VERSION } from "./human-package-preference-types.js";
import type { AuthenticatedHumanPayerIdentity } from "./human-payer-identity.js";
import type { CanonicalHumanPackageSelection } from "./human-purchase-commitment-types.js";
import {
  canonicalTime,
  exactKeys,
  identifier,
  objectValue,
  RAW_SHA256_PATTERN,
  SHA256_PATTERN,
} from "./purchase-commitment-primitives.js";

type Scope = Readonly<{
  adminParty: string;
  challengeId: `sha256:${string}`;
  executeBefore: string;
  identity: AuthenticatedHumanPayerIdentity;
  observedAt: string;
  providerParty: string;
}>;

function sha256(value: unknown, label: string): `sha256:${string}` {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a SHA-256 identifier`);
  }
  return value as `sha256:${string}`;
}

function packageId(value: unknown): string {
  if (typeof value !== "string" || !RAW_SHA256_PATTERN.test(value)) {
    throw new Error("human package ID must be a lowercase SHA-256 value");
  }
  return value;
}

export function validateHumanPurchasePackageSelection(
  candidate: unknown,
  scope: Scope,
): CanonicalHumanPackageSelection {
  const selection = readAuthenticatedHumanPackagePreference(candidate);
  const authority = readHumanPackagePreferenceAuthority(candidate);
  if (
    authority.payerIdentity !== scope.identity ||
    authority.challengeId !== scope.challengeId ||
    authority.challengeObservedAt !== scope.observedAt ||
    authority.executeBefore !== scope.executeBefore ||
    authority.adminParty !== scope.adminParty ||
    authority.providerParty !== scope.providerParty ||
    authority.synchronizerId !== scope.identity.synchronizerId
  ) {
    throw new Error("human package authority does not match the purchase");
  }
  const record = objectValue(selection, "human purchase package selection");
  exactKeys(
    record,
    [
      "acquiredAt",
      "closureHash",
      "observationId",
      "packageIds",
      "parties",
      "references",
      "subjectHash",
      "synchronizerId",
      "version",
      "vettingValidAt",
    ],
    "human purchase package selection",
  );
  sha256(record.observationId, "human package observationId");
  if (
    record.version !== HUMAN_PACKAGE_SELECTION_VERSION ||
    !Array.isArray(record.references) ||
    record.references.length !== 1 ||
    Object.keys(record.references).length !== 1
  ) {
    throw new Error("human purchase requires exactly one Token package");
  }
  const reference = objectValue(record.references[0], "human Token package");
  exactKeys(
    reference,
    ["artifactIds", "packageId", "packageName", "packageVersion"],
    "human Token package",
  );
  const selectedPackageId = packageId(reference.packageId);
  if (
    reference.packageName !== "splice-amulet" ||
    !Array.isArray(reference.artifactIds) ||
    reference.artifactIds.length !== 1 ||
    Object.keys(reference.artifactIds).length !== 1
  ) {
    throw new Error("human purchase package must be exactly splice-amulet");
  }
  const artifactId = identifier(
    reference.artifactIds[0],
    "human Token package artifact ID",
    255,
  );
  const expectedParties = [
    scope.adminParty,
    scope.identity.party,
    scope.providerParty,
  ].sort(utf8Compare);
  if (
    !Array.isArray(record.packageIds) ||
    JSON.stringify(record.packageIds) !== JSON.stringify([selectedPackageId]) ||
    !Array.isArray(record.parties) ||
    JSON.stringify(record.parties) !== JSON.stringify(expectedParties) ||
    record.synchronizerId !== scope.identity.synchronizerId ||
    record.subjectHash !== scope.identity.subjectHash
  ) {
    throw new Error("human purchase package scope is inconsistent");
  }
  const acquiredAt = identifier(record.acquiredAt, "human package acquiredAt");
  const vettingValidAt = identifier(
    record.vettingValidAt,
    "human package vettingValidAt",
  );
  const acquiredAtMs = canonicalTime(acquiredAt, "human package acquiredAt");
  const vettingAtMs = canonicalTime(
    vettingValidAt,
    "human package vettingValidAt",
  );
  if (
    acquiredAtMs < canonicalTime(scope.observedAt, "challenge observedAt") ||
    acquiredAtMs > canonicalTime(scope.executeBefore, "challenge expiry") ||
    vettingAtMs < acquiredAtMs ||
    vettingAtMs > canonicalTime(scope.executeBefore, "challenge expiry")
  ) {
    throw new Error("human package timing is outside the purchase window");
  }
  return Object.freeze({
    version: HUMAN_PACKAGE_SELECTION_VERSION,
    closureHash: sha256(record.closureHash, "human package closureHash"),
    references: Object.freeze([
      Object.freeze({
        packageId: selectedPackageId,
        packageName: "splice-amulet" as const,
        packageVersion: identifier(
          reference.packageVersion,
          "human Token package version",
          128,
        ),
        artifactIds: Object.freeze([artifactId]) as readonly [string],
      }),
    ]) as CanonicalHumanPackageSelection["references"],
    packageIds: Object.freeze([selectedPackageId]) as readonly [string],
    parties: Object.freeze(expectedParties) as readonly [
      string,
      string,
      string,
    ],
    synchronizerId: scope.identity.synchronizerId,
    vettingValidAt,
    acquiredAt,
    subjectHash: sha256(record.subjectHash, "human package subjectHash"),
  });
}
