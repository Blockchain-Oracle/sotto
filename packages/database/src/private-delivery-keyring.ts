import { KeyObject } from "node:crypto";
import type {
  PrivateDeliveryKeyring,
  PrivateDeliveryKeyringInput,
} from "./private-delivery-types.js";

const KEY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const MAXIMUM_KEYS = 32;

type KeyringState = Readonly<{
  activeKeyId: string;
  keys: ReadonlyMap<string, KeyObject>;
}>;

const keyrings = new WeakMap<object, KeyringState>();

function invalid(): never {
  throw new Error("private delivery key configuration is invalid");
}

function exactKeys(value: object, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    invalid();
  }
}

function keyRecord(value: unknown): Readonly<{ id: string; key: KeyObject }> {
  if (typeof value !== "object" || value === null) invalid();
  exactKeys(value, ["id", "key"]);
  const record = value as { id?: unknown; key?: unknown };
  if (
    typeof record.id !== "string" ||
    !KEY_ID.test(record.id) ||
    !(record.key instanceof KeyObject) ||
    record.key.type !== "secret" ||
    record.key.symmetricKeySize !== 32
  ) {
    invalid();
  }
  return { id: record.id, key: record.key };
}

export function createPrivateDeliveryKeyring(
  input: PrivateDeliveryKeyringInput,
): PrivateDeliveryKeyring {
  if (typeof input !== "object" || input === null) invalid();
  exactKeys(input, ["activeKeyId", "keys"]);
  if (
    typeof input.activeKeyId !== "string" ||
    !KEY_ID.test(input.activeKeyId) ||
    !Array.isArray(input.keys) ||
    input.keys.length < 1 ||
    input.keys.length > MAXIMUM_KEYS
  ) {
    invalid();
  }
  const keys = new Map<string, KeyObject>();
  for (const candidate of input.keys) {
    const record = keyRecord(candidate);
    if (keys.has(record.id)) invalid();
    keys.set(record.id, record.key);
  }
  if (!keys.has(input.activeKeyId)) invalid();
  const keyring = Object.freeze({}) as PrivateDeliveryKeyring;
  keyrings.set(keyring, { activeKeyId: input.activeKeyId, keys });
  return keyring;
}

export function readPrivateDeliveryKeyring(
  candidate: PrivateDeliveryKeyring,
): KeyringState {
  if (typeof candidate !== "object" || candidate === null) invalid();
  const state = keyrings.get(candidate);
  if (state === undefined) invalid();
  return state;
}

export function safePrivateDeliveryKeyId(value: unknown): value is string {
  return typeof value === "string" && KEY_ID.test(value);
}
