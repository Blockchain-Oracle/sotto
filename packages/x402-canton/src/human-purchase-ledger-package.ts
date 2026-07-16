import { utf8Compare } from "./package-preference-artifact-validation.js";
import { HUMAN_PACKAGE_SELECTION_VERSION } from "./human-package-preference-types.js";
import type { CanonicalHumanPackageSelection } from "./human-purchase-commitment-types.js";
import { exactHumanArray } from "./human-purchase-ledger-intent-parser.js";
import {
  canonicalTime,
  identifier,
  RAW_SHA256_PATTERN,
  SHA256_PATTERN,
} from "./purchase-commitment-primitives.js";

type Scope = Readonly<{
  adminParty: string;
  executeBefore: string;
  payerParty: string;
  providerParty: string;
  requestedAt: string;
  subjectHash: `sha256:${string}`;
  synchronizerId: string;
}>;

function sha256(value: unknown, label: string): `sha256:${string}` {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a SHA-256 identifier`);
  }
  return value as `sha256:${string}`;
}

function packageId(value: unknown): string {
  if (typeof value !== "string" || !RAW_SHA256_PATTERN.test(value)) {
    throw new Error("human Ledger package ID is invalid");
  }
  return value;
}

function stringArray(value: unknown, length: number, label: string): string[] {
  return exactHumanArray(value, length, label).map((entry, index) =>
    identifier(entry, `${label}[${index}]`, 512),
  );
}

export function projectHumanLedgerPackageSelection(
  value: Record<string, unknown>,
  reference: Record<string, unknown>,
  scope: Scope,
): CanonicalHumanPackageSelection {
  const selectedPackageId = packageId(reference.packageId);
  const packageIds = stringArray(value.packageIds, 1, "human package IDs");
  const parties = stringArray(value.parties, 3, "human package parties");
  const expectedParties = [
    scope.adminParty,
    scope.payerParty,
    scope.providerParty,
  ].sort(utf8Compare);
  if (
    value.version !== HUMAN_PACKAGE_SELECTION_VERSION ||
    reference.packageName !== "splice-amulet" ||
    packageIds[0] !== selectedPackageId ||
    new Set(parties).size !== parties.length ||
    JSON.stringify(parties) !==
      JSON.stringify([...parties].sort(utf8Compare)) ||
    JSON.stringify(parties) !== JSON.stringify(expectedParties) ||
    value.synchronizerId !== scope.synchronizerId ||
    value.subjectHash !== scope.subjectHash
  ) {
    throw new Error("human Ledger package selection is inconsistent");
  }
  const acquiredAt = identifier(value.acquiredAt, "human package acquiredAt");
  const vettingValidAt = identifier(
    value.vettingValidAt,
    "human package vettingValidAt",
  );
  const requestedAtMs = canonicalTime(
    scope.requestedAt,
    "challenge requestedAt",
  );
  const executeBeforeMs = canonicalTime(
    scope.executeBefore,
    "challenge executeBefore",
  );
  const acquiredAtMs = canonicalTime(acquiredAt, "human package acquiredAt");
  const vettingAtMs = canonicalTime(
    vettingValidAt,
    "human package vettingValidAt",
  );
  if (
    acquiredAtMs < requestedAtMs ||
    acquiredAtMs > executeBeforeMs ||
    vettingAtMs < acquiredAtMs ||
    vettingAtMs > executeBeforeMs
  ) {
    throw new Error("human Ledger package timing is inconsistent");
  }
  const artifactId = stringArray(
    reference.artifactIds,
    1,
    "human package artifact IDs",
  )[0]!;
  return Object.freeze({
    version: HUMAN_PACKAGE_SELECTION_VERSION,
    closureHash: sha256(value.closureHash, "human package closureHash"),
    references: Object.freeze([
      Object.freeze({
        packageId: selectedPackageId,
        packageName: "splice-amulet" as const,
        packageVersion: identifier(
          reference.packageVersion,
          "human package version",
          128,
        ),
        artifactIds: Object.freeze([artifactId]) as readonly [string],
      }),
    ]) as CanonicalHumanPackageSelection["references"],
    packageIds: Object.freeze([selectedPackageId]) as readonly [string],
    parties: Object.freeze(parties) as readonly [string, string, string],
    synchronizerId: scope.synchronizerId,
    vettingValidAt,
    acquiredAt,
    subjectHash: scope.subjectHash,
  });
}
