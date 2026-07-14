import { identifier, objectValue } from "./purchase-commitment-primitives.js";
import { requireReviewedPackagePreferenceClosure } from "./package-preference-closure.js";

const packageIdPattern = /^[a-f0-9]{64}$/;
const MAX_REFERENCES = 64;

export interface LivePackageReference {
  packageId: string;
  packageName: string;
  packageVersion: string;
}

export interface VerifiedPackageReference extends LivePackageReference {
  readonly artifactIds: ReadonlyArray<string>;
}

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function compareReferences(
  left: LivePackageReference,
  right: LivePackageReference,
): number {
  return (
    utf8Compare(left.packageName, right.packageName) ||
    utf8Compare(left.packageVersion, right.packageVersion) ||
    utf8Compare(left.packageId, right.packageId)
  );
}

function referencesArray(value: unknown): unknown[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_REFERENCES ||
    Object.keys(value).length !== value.length
  ) {
    throw new Error(
      "live package references must be a non-empty bounded array",
    );
  }
  return value;
}

export function verifyReviewedPackageReferences(
  closureValue: unknown,
  referencesValue: unknown,
): ReadonlyArray<Readonly<VerifiedPackageReference>> {
  const closure = requireReviewedPackagePreferenceClosure(closureValue);
  const approvedById = new Map(
    closure.graphPackages.map((entry) => [entry.packageId, entry]),
  );
  const seen = new Set<string>();
  const verified = referencesArray(referencesValue).map((value) => {
    const record = objectValue(value, "live package reference");
    if (
      Object.keys(record).sort().join(",") !==
      "packageId,packageName,packageVersion"
    ) {
      throw new Error("live package reference keys are not approved");
    }
    if (
      typeof record.packageId !== "string" ||
      !packageIdPattern.test(record.packageId) ||
      seen.has(record.packageId)
    ) {
      throw new Error("live package reference ID is invalid or duplicated");
    }
    seen.add(record.packageId);
    const expected = approvedById.get(record.packageId);
    const packageName = identifier(
      record.packageName,
      "live package name",
      255,
    );
    const packageVersion = identifier(
      record.packageVersion,
      "live package version",
      128,
    );
    if (
      expected === undefined ||
      expected.name !== packageName ||
      expected.version !== packageVersion
    ) {
      throw new Error("live package reference is outside the reviewed union");
    }
    return Object.freeze({
      packageId: expected.packageId,
      packageName: expected.name,
      packageVersion: expected.version,
      artifactIds: Object.freeze([...expected.artifactIds]),
    });
  });
  return Object.freeze(verified.sort(compareReferences));
}
