import {
  exactKeys,
  identifier,
  objectValue,
  sha256Hex,
} from "./purchase-commitment-primitives.js";
import type {
  PackageArtifactPin,
  PackageManifestEntry,
  PackageSourcePin,
} from "./package-preference-closure.js";

const gitCommitPattern = /^[a-f0-9]{40}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
export const MAX_PACKAGES = 512;

export type ValidatedPackageArtifactPin = Readonly<
  Omit<PackageArtifactPin, "packages">
> & {
  readonly packages: ReadonlyArray<Readonly<PackageManifestEntry>>;
};

export function boundedArray(
  value: unknown,
  label: string,
  maximum: number,
): unknown[] {
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

export function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function comparePackages(
  left: PackageManifestEntry,
  right: PackageManifestEntry,
): number {
  return (
    utf8Compare(left.name, right.name) ||
    utf8Compare(left.version, right.version) ||
    utf8Compare(left.packageId, right.packageId)
  );
}

function rawHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !sha256Pattern.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 value`);
  }
  return value;
}

export function sourcePin(value: unknown): PackageSourcePin {
  const record = objectValue(value, "source pin");
  exactKeys(record, ["id", "repository", "commit"], "source pin");
  const repository = identifier(record.repository, "source repository", 512);
  let parsed: URL;
  try {
    parsed = new URL(repository);
  } catch {
    throw new Error("source repository must be an exact HTTPS URL");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    repository !== parsed.href.replace(/\/$/u, "")
  ) {
    throw new Error("source repository must be an exact HTTPS URL");
  }
  if (
    typeof record.commit !== "string" ||
    !gitCommitPattern.test(record.commit)
  ) {
    throw new Error("source commit must be a pinned lowercase Git commit");
  }
  return Object.freeze({
    id: identifier(record.id, "source pin ID", 128),
    repository,
    commit: record.commit,
  });
}

export function packageEntry(value: unknown): Readonly<PackageManifestEntry> {
  const record = objectValue(value, "package entry");
  exactKeys(record, ["packageId", "name", "version"], "package entry");
  return Object.freeze({
    packageId: rawHash(record.packageId, "package ID"),
    name: identifier(record.name, "package name", 255),
    version: identifier(record.version, "package version", 128),
  });
}

function manifestHash(packages: ReadonlyArray<PackageManifestEntry>): string {
  const manifest = `${packages
    .map(({ packageId, name, version }) => `${packageId}\t${name}\t${version}`)
    .join("\n")}\n`;
  return sha256Hex(manifest);
}

export function artifactPin(
  value: unknown,
  sourceIds: ReadonlySet<string>,
): ValidatedPackageArtifactPin {
  const record = objectValue(value, "artifact pin");
  exactKeys(
    record,
    [
      "id",
      "name",
      "version",
      "sourcePinId",
      "darSha256",
      "mainPackageId",
      "manifestSha256",
      "packages",
    ],
    "artifact pin",
  );
  const packages = boundedArray(
    record.packages,
    "artifact packages",
    MAX_PACKAGES,
  )
    .map(packageEntry)
    .sort(comparePackages);
  assertUnique(
    packages.map(({ packageId }) => packageId),
    "artifact package IDs",
  );
  const sourcePinId = identifier(
    record.sourcePinId,
    "artifact source pin",
    128,
  );
  if (!sourceIds.has(sourcePinId)) {
    throw new Error("artifact source is not pinned");
  }
  const mainPackageId = rawHash(
    record.mainPackageId,
    "artifact main package ID",
  );
  const name = identifier(record.name, "artifact name", 255);
  const version = identifier(record.version, "artifact version", 128);
  if (
    !packages.some(
      (entry) =>
        entry.packageId === mainPackageId &&
        entry.name === name &&
        entry.version === version,
    )
  ) {
    throw new Error("artifact main package must match its manifest identity");
  }
  const expectedManifestHash = rawHash(
    record.manifestSha256,
    "artifact manifest digest",
  );
  if (manifestHash(packages) !== expectedManifestHash) {
    throw new Error(
      "artifact manifest digest does not match its package tuples",
    );
  }
  return Object.freeze({
    id: identifier(record.id, "artifact ID", 128),
    name,
    version,
    sourcePinId,
    darSha256: rawHash(record.darSha256, "artifact DAR digest"),
    mainPackageId,
    manifestSha256: expectedManifestHash,
    packages: Object.freeze(packages),
  });
}

export function assertUnique(
  values: ReadonlyArray<string>,
  label: string,
): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must be unique`);
  }
}
