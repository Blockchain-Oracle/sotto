import { createHash } from "node:crypto";

export const MAX_LEDGER_PACKAGE_BYTES = 16_777_216;
const PACKAGE_ID_PATTERN = /^[0-9a-f]{64}$/u;

export function requireLedgerPackageId(value: unknown): string {
  if (typeof value !== "string" || !PACKAGE_ID_PATTERN.test(value)) {
    throw new Error("Ledger package ID must be lowercase SHA-256");
  }
  return value;
}

export function verifyLedgerPackagePresence(
  bytes: Uint8Array,
  expectedPackageId: string,
) {
  const packageId = requireLedgerPackageId(expectedPackageId);
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_LEDGER_PACKAGE_BYTES
  ) {
    throw new Error("Ledger package payload is empty or exceeds byte limit");
  }
  const archivePayloadSha256 = createHash("sha256").update(bytes).digest("hex");
  if (archivePayloadSha256 !== packageId) {
    throw new Error("Ledger package payload hash does not match package ID");
  }
  return Object.freeze({ archivePayloadSha256, packageId });
}
