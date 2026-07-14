import { sha256Hex } from "./purchase-commitment-primitives.js";
import { validatePackagePreferenceClosure } from "./package-preference-closure-validation.js";

export const PACKAGE_PREFERENCE_CLOSURE_VERSION =
  "sotto-package-closure-v1" as const;
const authenticClosures = new WeakSet<object>();

export interface PackageManifestEntry {
  packageId: string;
  name: string;
  version: string;
}

export interface PackageSourcePin {
  id: string;
  repository: string;
  commit: string;
}

export interface PackageArtifactPin {
  id: string;
  name: string;
  version: string;
  sourcePinId: string;
  darSha256: string;
  mainPackageId: string;
  manifestSha256: string;
  packages: PackageManifestEntry[];
}

export interface ReviewedPackagePreferenceClosureInput {
  version: string;
  sourcePins: PackageSourcePin[];
  artifacts: PackageArtifactPin[];
  selectablePackageNames: string[];
  graphPackages: PackageManifestEntry[];
}

export interface ReviewedGraphPackage extends PackageManifestEntry {
  artifactIds: ReadonlyArray<string>;
}

export interface ReviewedPackagePreferenceClosure {
  readonly version: typeof PACKAGE_PREFERENCE_CLOSURE_VERSION;
  readonly closureHash: string;
  readonly canonicalBytes: Uint8Array;
  readonly sourcePins: ReadonlyArray<Readonly<PackageSourcePin>>;
  readonly artifacts: ReadonlyArray<
    Readonly<Omit<PackageArtifactPin, "packages">> & {
      readonly packages: ReadonlyArray<Readonly<PackageManifestEntry>>;
    }
  >;
  readonly selectablePackageNames: ReadonlyArray<string>;
  readonly graphPackages: ReadonlyArray<Readonly<ReviewedGraphPackage>>;
}

export function buildReviewedPackagePreferenceClosure(
  input: ReviewedPackagePreferenceClosureInput,
): ReviewedPackagePreferenceClosure {
  const projection = validatePackagePreferenceClosure(
    input,
    PACKAGE_PREFERENCE_CLOSURE_VERSION,
  );
  const canonicalBytes = new TextEncoder().encode(JSON.stringify(projection));
  const closureHash = `sha256:${sha256Hex(canonicalBytes)}`;

  const closure = Object.freeze({
    ...projection,
    closureHash,
    get canonicalBytes(): Uint8Array {
      return canonicalBytes.slice();
    },
  });
  authenticClosures.add(closure);
  return closure;
}

export function requireReviewedPackagePreferenceClosure(
  value: unknown,
): ReviewedPackagePreferenceClosure {
  if (
    typeof value !== "object" ||
    value === null ||
    !authenticClosures.has(value)
  ) {
    throw new Error("package preference closure is not authenticated");
  }
  return value as ReviewedPackagePreferenceClosure;
}
