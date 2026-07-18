import { identifier } from "./purchase-commitment-primitives.js";

export function settlementRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function settlementExactKeys(
  value: Record<string, unknown> | undefined,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    value !== undefined &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

export function settlementDenseArray(
  value: unknown,
  minimum: number,
  maximum: number,
): value is unknown[] {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum
  ) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.length === value.length &&
    keys.every((key, index) => key === String(index))
  );
}

export function settlementContractId(
  value: unknown,
  forbidden: ReadonlySet<string>,
): value is string {
  return (
    settlementIdentifier(value, 2_048) &&
    value.startsWith("00") &&
    !forbidden.has(value)
  );
}

export function settlementIdentifier(
  value: unknown,
  maximumBytes = 512,
): value is string {
  try {
    return identifier(value, "settlement identifier", maximumBytes) === value;
  } catch {
    return false;
  }
}
