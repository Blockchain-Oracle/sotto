import { utf8Compare } from "./package-preference-artifact-validation.js";
import { PACKAGE_SELECTION_VERSION } from "./package-preference-observation-types.js";
import { REQUIRED_PACKAGE_NAMES } from "./package-preference-observation-validation.js";
import type { CanonicalPurchasePackageSelection } from "./purchase-package-selection-types.js";
import {
  canonicalTime,
  identifier,
  RAW_SHA256_PATTERN,
  SHA256_PATTERN,
} from "./purchase-commitment-primitives.js";

type PackageRequirement =
  CanonicalPurchasePackageSelection["requirements"][number];
type PackageReference = CanonicalPurchasePackageSelection["references"][number];
export type BoundedPurchasePackageSelection = CanonicalPurchasePackageSelection;

export type PackageSelectionSemanticScope = Readonly<{
  agentParty: string;
  payerParty: string;
  recipientParty: string;
  adminParty: string;
  synchronizerId: string;
  requestedAt: string;
  executeBefore: string;
}>;

function values(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function identifiers(value: unknown, label: string, maxBytes = 512): string[] {
  return values(value, label).map((entry) =>
    identifier(entry, label, maxBytes),
  );
}

function assertLexicalUnique(values: string[], label: string): void {
  const expected = [...new Set(values)].sort(utf8Compare);
  if (JSON.stringify(values) !== JSON.stringify(expected)) {
    throw new Error(`${label} must be unique and UTF-8 lexical`);
  }
}

function rawPackageId(value: unknown): string {
  if (typeof value !== "string" || !RAW_SHA256_PATTERN.test(value)) {
    throw new Error("purchase package ID must be a lowercase SHA-256 value");
  }
  return value;
}

function sha256(value: unknown, label: string): `sha256:${string}` {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a SHA-256 identifier`);
  }
  return value as `sha256:${string}`;
}

function parseRequirements(
  records: ReadonlyArray<Record<string, unknown>>,
): PackageRequirement[] {
  return records.map((record) => {
    const parties = identifiers(record.parties, "purchase requirement party");
    assertLexicalUnique(parties, "purchase requirement parties");
    return {
      packageName: identifier(record.packageName, "purchase package name", 255),
      parties,
    };
  });
}

function parseReferences(
  records: ReadonlyArray<Record<string, unknown>>,
): PackageReference[] {
  return records.map((record) => {
    const artifactIds = identifiers(
      record.artifactIds,
      "purchase package artifact ID",
      128,
    );
    if (artifactIds.length !== 1) {
      throw new Error("purchase package reference must bind one artifact ID");
    }
    assertLexicalUnique(artifactIds, "purchase package artifact IDs");
    return {
      packageId: rawPackageId(record.packageId),
      packageName: identifier(record.packageName, "purchase package name", 255),
      packageVersion: identifier(
        record.packageVersion,
        "purchase package version",
        128,
      ),
      artifactIds,
    };
  });
}

function freezeSelection(
  selection: BoundedPurchasePackageSelection,
): BoundedPurchasePackageSelection {
  for (const requirement of selection.requirements) {
    Object.freeze(requirement.parties);
    Object.freeze(requirement);
  }
  for (const reference of selection.references) {
    Object.freeze(reference.artifactIds);
    Object.freeze(reference);
  }
  Object.freeze(selection.requirements);
  Object.freeze(selection.references);
  Object.freeze(selection.packageIds);
  Object.freeze(selection.parties);
  return Object.freeze(selection);
}

export function projectPurchasePackageSelection(
  selection: Record<string, unknown>,
  requirementRecords: ReadonlyArray<Record<string, unknown>>,
  referenceRecords: ReadonlyArray<Record<string, unknown>>,
  scope: PackageSelectionSemanticScope,
): BoundedPurchasePackageSelection {
  const requirements = parseRequirements(requirementRecords);
  const references = parseReferences(referenceRecords);
  const requirementNames = requirements.map(({ packageName }) => packageName);
  const referenceNames = references.map(({ packageName }) => packageName);
  const parties = identifiers(selection.parties, "purchase package party");
  const packageIds = values(selection.packageIds, "purchase package IDs").map(
    rawPackageId,
  );
  assertLexicalUnique(parties, "purchase package parties");
  assertLexicalUnique(packageIds, "purchase package IDs");
  assertLexicalUnique(referenceNames, "purchase package reference names");
  const expectedParties = [
    scope.adminParty,
    scope.agentParty,
    scope.payerParty,
    scope.recipientParty,
  ].sort(utf8Compare);
  const expectedPackageIds = references
    .map(({ packageId }) => packageId)
    .sort(utf8Compare);
  if (
    selection.version !== PACKAGE_SELECTION_VERSION ||
    JSON.stringify(requirementNames) !==
      JSON.stringify(REQUIRED_PACKAGE_NAMES) ||
    JSON.stringify(referenceNames) !== JSON.stringify(REQUIRED_PACKAGE_NAMES) ||
    JSON.stringify(packageIds) !== JSON.stringify(expectedPackageIds) ||
    JSON.stringify(parties) !== JSON.stringify(expectedParties) ||
    requirements.some(
      (requirement) =>
        JSON.stringify(requirement.parties) !== JSON.stringify(parties),
    ) ||
    selection.synchronizerId !== scope.synchronizerId
  ) {
    throw new Error("purchase package selection semantics are inconsistent");
  }
  const acquiredAt = identifier(selection.acquiredAt, "package acquiredAt");
  const vettingValidAt = identifier(
    selection.vettingValidAt,
    "package vettingValidAt",
  );
  const acquiredAtMs = canonicalTime(acquiredAt, "package acquiredAt");
  const vettingValidAtMs = canonicalTime(
    vettingValidAt,
    "package vettingValidAt",
  );
  if (
    acquiredAtMs < canonicalTime(scope.requestedAt, "challenge observedAt") ||
    acquiredAtMs > canonicalTime(scope.executeBefore, "challenge expiresAt") ||
    vettingValidAtMs < acquiredAtMs ||
    vettingValidAtMs > canonicalTime(scope.executeBefore, "challenge expiresAt")
  ) {
    throw new Error("purchase package selection time is outside the challenge");
  }
  return freezeSelection({
    version: PACKAGE_SELECTION_VERSION,
    observationId: sha256(selection.observationId, "package observationId"),
    closureHash: sha256(selection.closureHash, "package closure hash"),
    requirements,
    references,
    packageIds,
    parties,
    synchronizerId: identifier(
      selection.synchronizerId,
      "package synchronizerId",
    ),
    vettingValidAt,
    acquiredAt,
    authenticatedSubject: identifier(
      selection.authenticatedSubject,
      "package authenticated subject",
      255,
    ),
  });
}
