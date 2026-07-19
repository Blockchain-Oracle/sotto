import { exactKeys, objectValue } from "./purchase-commitment-primitives.js";

const CANONICAL_BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

export function exactPrepareObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  const result = objectValue(value, label);
  exactKeys(result, keys, label);
  if (JSON.stringify(Object.keys(result)) !== JSON.stringify(keys)) {
    throw new Error(`${label} keys must use canonical order`);
  }
  return result;
}

export function decodePrepareBase64(
  value: unknown,
  maximumBytes: number,
  label: string,
): Uint8Array {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.length % 4 !== 0 ||
    !CANONICAL_BASE64.test(value)
  ) {
    throw new Error(`${label} must use canonical base64`);
  }
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.byteLength < 1 ||
    bytes.byteLength > maximumBytes ||
    bytes.toString("base64") !== value
  ) {
    throw new Error(`${label} exceeds its byte limit`);
  }
  return Uint8Array.from(bytes);
}

export function canonicalPrepareTime(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid`);
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}
