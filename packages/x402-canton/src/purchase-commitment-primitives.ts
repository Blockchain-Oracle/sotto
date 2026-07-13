import { createHash } from "node:crypto";

export const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
export const RAW_SHA256_PATTERN = /^[a-f0-9]{64}$/;
export const REVISION_PATTERN = /^(?:0|[1-9]\d{0,18})$/;
const atomicPattern = /^(?:0|[1-9]\d{0,37})$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

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
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(allowed)) {
    throw new Error(`${label} keys must match the approved contract`);
  }
}

export function identifier(
  value: unknown,
  label: string,
  maxBytes = 512,
): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    hasUnpairedSurrogate(value) ||
    hasControlCharacter(value) ||
    Buffer.byteLength(value, "utf8") > maxBytes
  ) {
    throw new Error(`${label} must be a bounded exact identifier`);
  }
  return value;
}

export function canonicalTime(value: unknown, label: string): number {
  if (typeof value !== "string" || !timestampPattern.test(value)) {
    throw new Error(`${label} must use canonical millisecond UTC`);
  }
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new Error(`${label} must be a valid canonical timestamp`);
  }
  return milliseconds;
}

export function atomic(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !atomicPattern.test(value)) {
    throw new Error(`${label} must be a bounded atomic integer`);
  }
  return BigInt(value);
}
