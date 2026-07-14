import {
  boundedIdentifier,
  exactArray,
  exactKeys,
  objectValue,
  REQUIRED_NAMES,
  utf8Compare,
} from "./five-north-package-preference-validation.js";

const PACKAGE_ID_PATTERN = /^[a-f0-9]{64}$/u;

export function parseFiveNorthPackagePreferenceResponse(
  value: unknown,
  synchronizerId: string,
): ReadonlyArray<
  Readonly<{ packageId: string; packageName: string; packageVersion: string }>
> {
  const response = objectValue(value, "package preference response");
  exactKeys(
    response,
    ["packageReferences", "synchronizerId"],
    "package preference response",
  );
  if (response.synchronizerId !== synchronizerId) {
    throw new Error("package preference response synchronizer does not match");
  }
  const references = exactArray(
    response.packageReferences,
    REQUIRED_NAMES.length,
    "package references",
  );
  const seenPackageIds = new Set<string>();
  const parsed = references
    .map((value) => {
      const reference = objectValue(value, "package reference");
      exactKeys(
        reference,
        ["packageId", "packageName", "packageVersion"],
        "package reference",
      );
      const packageId = boundedIdentifier(
        reference.packageId,
        "package ID",
        64,
      );
      if (
        seenPackageIds.has(packageId) ||
        !PACKAGE_ID_PATTERN.test(packageId)
      ) {
        throw new Error("package preference package ID is invalid");
      }
      seenPackageIds.add(packageId);
      return Object.freeze({
        packageId,
        packageName: boundedIdentifier(
          reference.packageName,
          "package name",
          255,
        ),
        packageVersion: boundedIdentifier(
          reference.packageVersion,
          "package version",
          128,
        ),
      });
    })
    .sort((left, right) => utf8Compare(left.packageName, right.packageName));
  if (
    JSON.stringify(parsed.map(({ packageName }) => packageName)) !==
    JSON.stringify(REQUIRED_NAMES)
  ) {
    throw new Error("package preference response names are not exact");
  }
  return Object.freeze(parsed);
}
