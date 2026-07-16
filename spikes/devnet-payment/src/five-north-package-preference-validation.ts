import type { PackagePreferenceReadRequest } from "@sotto/x402-canton";
import { hasControlCharacter } from "./five-north-prepare-network.js";

export const REQUIRED_NAMES = Object.freeze(["sotto-control", "splice-amulet"]);
const PARTY_PATTERN = /^[^\s:]+::1220[a-f0-9]{64}$/u;
const SYNCHRONIZER_PATTERN = /^[^\s:]+::1220[a-f0-9]{64}$/u;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export function objectValue(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function exactKeys(
  value: Record<string, unknown>,
  expected: ReadonlyArray<string>,
  label: string,
): void {
  const actual = Object.keys(value).sort().join(",");
  const allowed = [...expected].sort().join(",");
  if (actual !== allowed) {
    throw new Error(`${label} keys are not approved`);
  }
}

export function exactArray(
  value: unknown,
  length: number,
  label: string,
): unknown[] {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    Object.keys(value).length !== length
  ) {
    throw new Error(`${label} must contain exactly ${length} entries`);
  }
  return value;
}

export function boundedIdentifier(
  value: unknown,
  label: string,
  maximumBytes: number,
): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > maximumBytes ||
    hasControlCharacter(value)
  ) {
    throw new Error(`${label} is not a bounded identifier`);
  }
  return value;
}

export function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function canonicalTime(value: unknown, label: string): string {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) {
    throw new Error(`${label} must use canonical millisecond UTC`);
  }
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new Error(`${label} is not a valid timestamp`);
  }
  return value;
}

function exactParties(value: unknown): string[] {
  const parties = exactArray(value, 3, "package preference parties").map(
    (party) => boundedIdentifier(party, "package preference party", 512),
  );
  if (
    parties.some((party) => !PARTY_PATTERN.test(party)) ||
    new Set(parties).size !== parties.length ||
    JSON.stringify(parties) !== JSON.stringify([...parties].sort(utf8Compare))
  ) {
    throw new Error("package preference parties are not exact and lexical");
  }
  return parties;
}

export function buildFiveNorthPackagePreferenceBody(
  candidate: PackagePreferenceReadRequest,
): Readonly<{ body: string; synchronizerId: string }> {
  const request = objectValue(candidate, "package preference request");
  exactKeys(
    request,
    ["packageRequirements", "synchronizerId", "vettingValidAt"],
    "package preference request",
  );
  const requirements = exactArray(
    request.packageRequirements,
    REQUIRED_NAMES.length,
    "package requirements",
  );
  let exactPartyProjection: string | undefined;
  const packageVettingRequirements = requirements.map((value, index) => {
    const requirement = objectValue(value, "package requirement");
    exactKeys(requirement, ["packageName", "parties"], "package requirement");
    if (requirement.packageName !== REQUIRED_NAMES[index]) {
      throw new Error("package requirements must use the exact reviewed names");
    }
    const parties = exactParties(requirement.parties);
    const projection = JSON.stringify(parties);
    if (
      exactPartyProjection !== undefined &&
      projection !== exactPartyProjection
    ) {
      throw new Error("package requirements must use identical parties");
    }
    exactPartyProjection = projection;
    return { packageName: REQUIRED_NAMES[index]!, parties };
  });
  const synchronizerId = boundedIdentifier(
    request.synchronizerId,
    "package preference synchronizer",
    512,
  );
  if (!SYNCHRONIZER_PATTERN.test(synchronizerId)) {
    throw new Error("package preference synchronizer is invalid");
  }
  const body = JSON.stringify({
    packageVettingRequirements,
    synchronizerId,
    vettingValidAt: canonicalTime(
      request.vettingValidAt,
      "package preference vettingValidAt",
    ),
  });
  if (Buffer.byteLength(body, "utf8") > 16_384) {
    throw new Error("package preference request exceeds its byte limit");
  }
  return Object.freeze({ body, synchronizerId });
}
