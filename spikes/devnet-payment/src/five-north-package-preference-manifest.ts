import {
  buildReviewedPackagePreferenceClosure,
  type PackageArtifactPin,
  type PackageManifestEntry,
  type ReviewedPackagePreferenceClosure,
} from "@sotto/x402-canton";
import {
  SPLICE_AMULET_0_1_9_METADATA,
  SPLICE_AMULET_0_1_9_PACKAGES,
} from "./package-manifests/splice-amulet-0_1_9.js";
import {
  SPLICE_AMULET_0_1_20_METADATA,
  SPLICE_AMULET_0_1_20_PACKAGES,
} from "./package-manifests/splice-amulet-0_1_20.js";
import {
  SPLICE_AMULET_0_1_21_METADATA,
  SPLICE_AMULET_0_1_21_PACKAGES,
} from "./package-manifests/splice-amulet-0_1_21.js";
import { APPROVED_SOTTO_CONTROL_DAR_PACKAGES } from "./sotto-control-dar-inventory.js";

const SOTTO_MANIFEST_SHA256 =
  "52858145b03b8bf852c847ae7b541f9c7c029481271d7eab3335e083ffd31fb1";
const SOTTO_MAIN_PACKAGE_ID =
  "4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57";
const SPLICE_SOURCE_COMMIT = "fd93f86ac42ce3a08985dcd0baae530b4f235f60";

type PackageTuple = readonly [string, string, string];

function packageEntries(
  tuples: ReadonlyArray<PackageTuple>,
): PackageManifestEntry[] {
  return tuples.map(([packageId, name, version]) => ({
    packageId,
    name,
    version,
  }));
}

function spliceArtifact(
  metadata: Readonly<{
    version: string;
    darSha256: string;
    mainPackageId: string;
    manifestSha256: string;
  }>,
  tuples: ReadonlyArray<PackageTuple>,
): PackageArtifactPin {
  return {
    id: `splice-amulet-${metadata.version}`,
    name: "splice-amulet",
    version: metadata.version,
    sourcePinId: "splice",
    darSha256: metadata.darSha256,
    mainPackageId: metadata.mainPackageId,
    manifestSha256: metadata.manifestSha256,
    packages: packageEntries(tuples),
  };
}

function graphUnion(
  artifacts: ReadonlyArray<PackageArtifactPin>,
): PackageManifestEntry[] {
  const union = new Map<string, PackageManifestEntry>();
  for (const artifact of artifacts) {
    for (const entry of artifact.packages) {
      const prior = union.get(entry.packageId);
      if (
        prior !== undefined &&
        (prior.name !== entry.name || prior.version !== entry.version)
      ) {
        throw new Error("reviewed package inventories conflict for one ID");
      }
      union.set(entry.packageId, entry);
    }
  }
  return [...union.values()];
}

function spliceArtifacts(): PackageArtifactPin[] {
  return [
    spliceArtifact(SPLICE_AMULET_0_1_9_METADATA, SPLICE_AMULET_0_1_9_PACKAGES),
    spliceArtifact(
      SPLICE_AMULET_0_1_20_METADATA,
      SPLICE_AMULET_0_1_20_PACKAGES,
    ),
    spliceArtifact(
      SPLICE_AMULET_0_1_21_METADATA,
      SPLICE_AMULET_0_1_21_PACKAGES,
    ),
  ];
}

export function buildFiveNorthHumanPackagePreferenceManifest(): ReviewedPackagePreferenceClosure {
  const artifacts = spliceArtifacts();
  return buildReviewedPackagePreferenceClosure({
    version: "sotto-package-closure-v1",
    sourcePins: [
      {
        id: "splice",
        repository: "https://github.com/canton-network/splice",
        commit: SPLICE_SOURCE_COMMIT,
      },
    ],
    artifacts,
    selectablePackageNames: ["splice-amulet"],
    graphPackages: graphUnion(artifacts),
  });
}

export function buildFiveNorthPackagePreferenceManifest(
  input: Readonly<{ sottoSourceCommit: string; sottoDarSha256: string }>,
): ReviewedPackagePreferenceClosure {
  if (
    typeof input !== "object" ||
    input === null ||
    Object.keys(input).sort().join(",") !== "sottoDarSha256,sottoSourceCommit"
  ) {
    throw new Error("Five North manifest input keys are not approved");
  }
  const artifacts: PackageArtifactPin[] = [
    {
      id: "sotto-control-0.2.0",
      name: "sotto-control",
      version: "0.2.0",
      sourcePinId: "sotto",
      darSha256: input.sottoDarSha256,
      mainPackageId: SOTTO_MAIN_PACKAGE_ID,
      manifestSha256: SOTTO_MANIFEST_SHA256,
      packages: packageEntries(APPROVED_SOTTO_CONTROL_DAR_PACKAGES),
    },
    ...spliceArtifacts(),
  ];
  return buildReviewedPackagePreferenceClosure({
    version: "sotto-package-closure-v1",
    sourcePins: [
      {
        id: "sotto",
        repository: "https://github.com/Blockchain-Oracle/sotto",
        commit: input.sottoSourceCommit,
      },
      {
        id: "splice",
        repository: "https://github.com/canton-network/splice",
        commit: SPLICE_SOURCE_COMMIT,
      },
    ],
    artifacts,
    selectablePackageNames: ["sotto-control", "splice-amulet"],
    graphPackages: graphUnion(artifacts),
  });
}
