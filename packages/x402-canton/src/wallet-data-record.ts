import { types } from "node:util";

function plainWalletDataObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    types.isProxy(value) ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
}

export function exactWalletDataRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  plainWalletDataObject(value, label);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== "string") ||
    JSON.stringify([...ownKeys].sort()) !== JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} keys must match the approved contract`);
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error(`${label} must use own data properties`);
    }
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}

export function optionalWalletDataRecord(
  value: unknown,
  allowedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  plainWalletDataObject(value, label);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== "string" || !allowedKeys.includes(key))
  ) {
    throw new Error(`${label} keys must match the approved contract`);
  }
  return exactWalletDataRecord(value, ownKeys as string[], label);
}
