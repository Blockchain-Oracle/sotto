import { utf8Compare } from "./package-preference-artifact-validation.js";
import { REQUIRED_PACKAGE_NAMES } from "./package-preference-observation-validation.js";
import {
  RAW_SHA256_PATTERN,
  SHA256_PATTERN,
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";
import type { CanonicalPurchasePackageSelection } from "./purchase-package-selection-types.js";

function exactArray(value: unknown, length: number, label: string): unknown[] {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    Object.keys(value).length !== length
  ) {
    throw new Error(`${label} must contain exactly ${length} values`);
  }
  return value;
}

export function rawPackageId(value: unknown, label: string): string {
  if (typeof value !== "string" || !RAW_SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase package ID`);
  }
  return value;
}

export function packageSelectionSha256(
  value: unknown,
  label: string,
): `sha256:${string}` {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a SHA-256 identifier`);
  }
  return value as `sha256:${string}`;
}

export function exactPackageSelectionStringArray(
  value: unknown,
  length: number,
  label: string,
  validate: (entry: unknown, entryLabel: string) => string = identifier,
): string[] {
  const entries = exactArray(value, length, label).map((entry, index) =>
    validate(entry, `${label}[${index}]`),
  );
  if (
    new Set(entries).size !== entries.length ||
    JSON.stringify(entries) !== JSON.stringify([...entries].sort(utf8Compare))
  ) {
    throw new Error(`${label} must be unique and UTF-8 lexical`);
  }
  return entries;
}

export function canonicalPackageReferences(
  value: unknown,
): CanonicalPurchasePackageSelection["references"] {
  const references = exactArray(
    value,
    REQUIRED_PACKAGE_NAMES.length,
    "package references",
  ).map((candidate, index) => {
    const record = objectValue(candidate, `package reference[${index}]`);
    exactKeys(
      record,
      ["packageId", "packageName", "packageVersion", "artifactIds"],
      `package reference[${index}]`,
    );
    return Object.freeze({
      packageId: rawPackageId(
        record.packageId,
        `package reference[${index}] ID`,
      ),
      packageName: identifier(
        record.packageName,
        `package reference[${index}] name`,
        255,
      ),
      packageVersion: identifier(
        record.packageVersion,
        `package reference[${index}] version`,
        128,
      ),
      artifactIds: Object.freeze(
        exactPackageSelectionStringArray(
          record.artifactIds,
          1,
          `package reference[${index}] artifact IDs`,
        ),
      ),
    });
  });
  if (
    JSON.stringify(references.map(({ packageName }) => packageName)) !==
    JSON.stringify(REQUIRED_PACKAGE_NAMES)
  ) {
    throw new Error("package references must match the exact required names");
  }
  return Object.freeze(references);
}
