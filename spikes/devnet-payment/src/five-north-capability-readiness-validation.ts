import { SOTTO_CONTROL_PACKAGE_ID } from "@sotto/x402-canton";

const PARTY_PATTERN = /^[^\s:]+::1220[0-9a-f]{64}$/u;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function readinessIdentifier(
  value: unknown,
  label: string,
  maximum = 512,
): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > maximum
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

export function readinessParty(
  value: unknown,
  label: string,
  sottoOnly = false,
): string {
  const result = readinessIdentifier(value, label);
  if (
    !PARTY_PATTERN.test(result) ||
    (sottoOnly && !result.startsWith("sotto-"))
  ) {
    throw new Error(`${label} is invalid`);
  }
  return result;
}

export function parseCapabilityPackagePresence(value: unknown): void {
  const presence = objectValue(value, "sotto-control package presence");
  if (
    Object.keys(presence).sort().join(",") !==
      "archivePayloadSha256,packageId" ||
    presence.packageId !== SOTTO_CONTROL_PACKAGE_ID ||
    presence.archivePayloadSha256 !== SOTTO_CONTROL_PACKAGE_ID
  ) {
    throw new Error("sotto-control package presence does not match");
  }
}

export function parseCapabilityAmuletRules(value: unknown) {
  const root = objectValue(value, "AmuletRules response");
  const rules = objectValue(root.amulet_rules, "AmuletRules contract");
  const contract = objectValue(rules.contract, "AmuletRules payload wrapper");
  const payload = objectValue(contract.payload, "AmuletRules payload");
  return Object.freeze({
    expectedAdmin: readinessParty(payload.dso, "AmuletRules DSO Party"),
    synchronizerId: readinessParty(
      rules.domain_id,
      "AmuletRules synchronizer ID",
    ),
  });
}

export function parsePreferredCapabilityPackage(
  value: unknown,
  synchronizerId: string,
): void {
  const preferred = objectValue(value, "preferred sotto-control package");
  if (
    Object.keys(preferred).sort().join(",") !==
      "packageReferences,synchronizerId" ||
    preferred.synchronizerId !== synchronizerId ||
    !Array.isArray(preferred.packageReferences) ||
    preferred.packageReferences.length !== 1
  ) {
    throw new Error("preferred sotto-control package does not match");
  }
  const reference = objectValue(
    preferred.packageReferences[0],
    "preferred sotto-control package reference",
  );
  if (
    Object.keys(reference).sort().join(",") !==
      "packageId,packageName,packageVersion" ||
    reference.packageId !== SOTTO_CONTROL_PACKAGE_ID ||
    reference.packageName !== "sotto-control" ||
    reference.packageVersion !== "0.2.0"
  ) {
    throw new Error("preferred sotto-control package is unsupported");
  }
}
