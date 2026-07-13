import { SOTTO_CONTROL_PACKAGE_ID } from "@sotto/x402-canton";
import { requireLedgerPackageId } from "./five-north-package-presence.js";

const MAXIMUM_PACKAGE_IDS = 100_000;

declare const deploymentAuthorityBrand: unique symbol;
export type FiveNorthPackageDeploymentAuthority = Readonly<{
  authenticatedUserSha256: `sha256:${string}`;
  observationId: `sha256:${string}`;
  observedAt: string;
  synchronizerId: string;
  readonly [deploymentAuthorityBrand]: true;
}>;

export type FiveNorthPackageDeploymentTransport = Readonly<{
  listPackageIds: () => Promise<unknown>;
  observeDeploymentAuthority: () => Promise<FiveNorthPackageDeploymentAuthority>;
  readPackagePresence: (packageId: string) => Promise<unknown>;
  uploadDar: (
    bytes: Uint8Array,
    authority: FiveNorthPackageDeploymentAuthority,
    beforeDispatch: () => Promise<void>,
  ) => Promise<void>;
  validateDar: (
    bytes: Uint8Array,
    authority: FiveNorthPackageDeploymentAuthority,
  ) => Promise<void>;
}>;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function fiveNorthHasApprovedSottoPackage(value: unknown): boolean {
  const root = objectValue(value, "Five North package list");
  if (
    Object.keys(root).join(",") !== "packageIds" ||
    !Array.isArray(root.packageIds) ||
    root.packageIds.length > MAXIMUM_PACKAGE_IDS
  ) {
    throw new Error("Five North package list is invalid");
  }
  const seen = new Set<string>();
  for (const candidate of root.packageIds) {
    const packageId = requireLedgerPackageId(candidate);
    if (seen.has(packageId)) {
      throw new Error("Five North package list contains duplicates");
    }
    seen.add(packageId);
  }
  return seen.has(SOTTO_CONTROL_PACKAGE_ID);
}

function requireApprovedPresence(value: unknown): void {
  const presence = objectValue(value, "Five North package presence");
  if (
    Object.keys(presence).sort().join(",") !==
      "archivePayloadSha256,packageId" ||
    presence.packageId !== SOTTO_CONTROL_PACKAGE_ID ||
    presence.archivePayloadSha256 !== SOTTO_CONTROL_PACKAGE_ID
  ) {
    throw new Error("Five North package presence is not proven");
  }
}

export async function proveFiveNorthSottoControlPackagePresent(
  transport: FiveNorthPackageDeploymentTransport,
): Promise<void> {
  requireApprovedPresence(
    await transport.readPackagePresence(SOTTO_CONTROL_PACKAGE_ID),
  );
}
