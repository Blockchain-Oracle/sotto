import { createHash } from "node:crypto";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export function capabilityBootstrapJournalSha256(
  value: string,
): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function exactCapabilityBootstrapJournalObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (
    JSON.stringify(Object.keys(record).sort()) !==
    JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} keys are invalid`);
  }
  return record;
}

export function isMissingCapabilityBootstrapJournalRecord(
  error: unknown,
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export function capabilityBootstrapJournalHash(
  value: unknown,
  label: string,
): `sha256:${string}` {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a SHA-256 identifier`);
  }
  return value as `sha256:${string}`;
}

export function capabilityBootstrapJournalIdentifier(
  value: unknown,
  label: string,
  maximumBytes = 512,
): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    new TextEncoder().encode(value).byteLength > maximumBytes ||
    [...value].some((character) => character.charCodeAt(0) <= 0x1f)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

export function capabilityBootstrapJournalTimestamp(value: unknown): string {
  const milliseconds = typeof value === "string" ? Date.parse(value) : NaN;
  if (
    typeof value !== "string" ||
    !TIMESTAMP_PATTERN.test(value) ||
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new Error("bootstrap wallet record timestamp is invalid");
  }
  return value;
}
