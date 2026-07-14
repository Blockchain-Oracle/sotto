import {
  artifactPin,
  assertUnique,
  boundedArray,
  comparePackages,
  MAX_PACKAGES,
  packageEntry,
  sourcePin,
  utf8Compare,
  type ValidatedPackageArtifactPin,
} from "./package-preference-artifact-validation.js";
import {
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";
import type {
  PackageArtifactPin,
  PackageManifestEntry,
  PackageSourcePin,
  ReviewedGraphPackage,
  ReviewedPackagePreferenceClosureInput,
} from "./package-preference-closure.js";

const MAX_SOURCES = 16;
const MAX_ARTIFACTS = 32;
const MAX_SELECTABLE_NAMES = 32;

export interface PackageClosureProjection {
  version: "sotto-package-closure-v1";
  sourcePins: ReadonlyArray<Readonly<PackageSourcePin>>;
  artifacts: ReadonlyArray<
    Readonly<Omit<PackageArtifactPin, "packages">> & {
      packages: ReadonlyArray<Readonly<PackageManifestEntry>>;
    }
  >;
  selectablePackageNames: ReadonlyArray<string>;
  graphPackages: ReadonlyArray<Readonly<ReviewedGraphPackage>>;
}

function canonicalGraph(
  artifacts: ReadonlyArray<ValidatedPackageArtifactPin>,
  claimedGraph: ReadonlyArray<Readonly<PackageManifestEntry>>,
): ReadonlyArray<Readonly<ReviewedGraphPackage>> {
  const derived = new Map<
    string,
    { entry: PackageManifestEntry; artifactIds: string[] }
  >();
  for (const artifact of artifacts) {
    for (const entry of artifact.packages) {
      const prior = derived.get(entry.packageId);
      if (
        prior !== undefined &&
        (prior.entry.name !== entry.name ||
          prior.entry.version !== entry.version)
      ) {
        throw new Error("artifact manifests conflict for one package ID");
      }
      if (prior === undefined)
        derived.set(entry.packageId, { entry, artifactIds: [] });
      derived.get(entry.packageId)!.artifactIds.push(artifact.id);
    }
  }
  assertUnique(
    claimedGraph.map(({ packageId }) => packageId),
    "graph package IDs",
  );
  if (claimedGraph.length !== derived.size) {
    throw new Error("graph packages must equal the reproduced artifact union");
  }
  for (const entry of claimedGraph) {
    const expected = derived.get(entry.packageId);
    if (
      expected === undefined ||
      expected.entry.name !== entry.name ||
      expected.entry.version !== entry.version
    ) {
      throw new Error(
        "graph packages must equal the reproduced artifact union",
      );
    }
  }
  return Object.freeze(
    [...derived.values()]
      .map(({ entry, artifactIds }) =>
        Object.freeze({
          ...entry,
          artifactIds: Object.freeze(artifactIds.sort(utf8Compare)),
        }),
      )
      .sort(comparePackages),
  );
}

export function validatePackagePreferenceClosure(
  input: ReviewedPackagePreferenceClosureInput,
  expectedVersion: "sotto-package-closure-v1",
): PackageClosureProjection {
  const record = objectValue(input, "package closure");
  exactKeys(
    record,
    [
      "version",
      "sourcePins",
      "artifacts",
      "selectablePackageNames",
      "graphPackages",
    ],
    "package closure",
  );
  if (record.version !== expectedVersion)
    throw new Error("package closure version is unsupported");
  const sourcePins = boundedArray(record.sourcePins, "source pins", MAX_SOURCES)
    .map(sourcePin)
    .sort((left, right) => utf8Compare(left.id, right.id));
  assertUnique(
    sourcePins.map(({ id }) => id),
    "source pin IDs",
  );
  assertUnique(
    sourcePins.map(({ repository, commit }) => `${repository}\0${commit}`),
    "source pin identities",
  );
  const artifacts = boundedArray(record.artifacts, "artifacts", MAX_ARTIFACTS)
    .map((value) => artifactPin(value, new Set(sourcePins.map(({ id }) => id))))
    .sort((left, right) => utf8Compare(left.id, right.id));
  assertUnique(
    artifacts.map(({ id }) => id),
    "artifact IDs",
  );
  assertUnique(
    artifacts.map(({ darSha256 }) => darSha256),
    "artifact DAR digests",
  );
  assertUnique(
    artifacts.map(({ name, version }) => `${name}\0${version}`),
    "artifact identities",
  );
  const selectablePackageNames = boundedArray(
    record.selectablePackageNames,
    "selectable package names",
    MAX_SELECTABLE_NAMES,
  ).map((value) => identifier(value, "selectable package name", 255));
  assertUnique(selectablePackageNames, "selectable package names");
  selectablePackageNames.sort(utf8Compare);
  const claimedGraph = boundedArray(
    record.graphPackages,
    "graph packages",
    MAX_PACKAGES,
  ).map(packageEntry);
  const graphPackages = canonicalGraph(artifacts, claimedGraph);
  const graphNames = new Set(graphPackages.map(({ name }) => name));
  if (selectablePackageNames.some((name) => !graphNames.has(name))) {
    throw new Error(
      "selectable package names must occur in the reviewed graph",
    );
  }
  return Object.freeze({
    version: expectedVersion,
    sourcePins: Object.freeze(sourcePins),
    artifacts: Object.freeze(artifacts),
    selectablePackageNames: Object.freeze(selectablePackageNames),
    graphPackages,
  });
}
