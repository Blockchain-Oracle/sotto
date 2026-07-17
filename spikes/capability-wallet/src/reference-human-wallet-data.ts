import { types } from "node:util";

export const REFERENCE_HUMAN_WALLET_MAX_PREPARED_BYTES = 2 * 1024 * 1024;
const HASH = /^sha256:[0-9a-f]{64}$/u;

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function referenceHumanWalletRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  const ownKeys =
    typeof value === "object" && value !== null ? Reflect.ownKeys(value) : [];
  if (
    typeof value !== "object" ||
    value === null ||
    types.isProxy(value) ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    ownKeys.some((key) => typeof key !== "string") ||
    JSON.stringify((ownKeys as string[]).sort()) !==
      JSON.stringify([...keys].sort())
  ) {
    throw new Error(`reference human wallet request ${label} is invalid`);
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error(
        `reference human wallet request ${label} must use data properties`,
      );
    }
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}

export function referenceHumanWalletIdentifier(
  value: unknown,
  label: string,
  maximumBytes = 512,
): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    !value.isWellFormed() ||
    hasControlCharacter(value) ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > maximumBytes
  ) {
    throw new Error(`reference human wallet request ${label} is invalid`);
  }
  return value;
}

export function referenceHumanWalletHash(
  value: unknown,
  label: string,
): `sha256:${string}` {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new Error(`reference human wallet request ${label} is invalid`);
  }
  return value as `sha256:${string}`;
}

export function referenceHumanWalletAtomic(
  value: unknown,
  label: string,
): string {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]{0,20})$/u.test(value)) {
    throw new Error(`reference human wallet request ${label} is invalid`);
  }
  return value;
}

export function referenceHumanWalletTime(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(Date.parse(value)).toISOString() !== value
  ) {
    throw new Error(`reference human wallet request ${label} is invalid`);
  }
  return value;
}

export function referenceHumanWalletPreparedBase64(value: unknown): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(
      "reference human wallet request prepared bytes are invalid",
    );
  }
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > REFERENCE_HUMAN_WALLET_MAX_PREPARED_BYTES ||
    bytes.toString("base64") !== value
  ) {
    throw new Error(
      "reference human wallet request prepared bytes are not canonical",
    );
  }
  return value;
}
