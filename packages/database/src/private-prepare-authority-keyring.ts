import { KeyObject } from "node:crypto";
import type {
  PrepareAuthorityKeyring,
  PrepareAuthorityKeyringInput,
} from "./private-prepare-authority-types.js";

const KEY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const MAXIMUM_KEYS = 32;

type KeyringState = Readonly<{
  activeKeyId: string;
  keys: ReadonlyMap<string, KeyObject>;
}>;

const keyrings = new WeakMap<object, KeyringState>();

function invalid(): never {
  throw new Error("private prepare authority key configuration is invalid");
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

export function createPrepareAuthorityKeyring(
  input: PrepareAuthorityKeyringInput,
): PrepareAuthorityKeyring {
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
  const keyring = Object.freeze({}) as PrepareAuthorityKeyring;
  keyrings.set(keyring, {
    activeKeyId: input.activeKeyId,
    keys,
  });
  return keyring;
}

export function readPrivatePrepareAuthorityActiveKeyId(
  keyring: PrepareAuthorityKeyring,
): string {
  return readPrepareAuthorityKeyring(keyring).activeKeyId;
}

export function readPrepareAuthorityKeyring(
  candidate: PrepareAuthorityKeyring,
): KeyringState {
  if (typeof candidate !== "object" || candidate === null) invalid();
  const state = keyrings.get(candidate);
  if (state === undefined) invalid();
  return state;
}

export function safePrepareAuthorityKeyId(value: unknown): value is string {
  return typeof value === "string" && KEY_ID.test(value);
}
