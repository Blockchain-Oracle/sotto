import { Buffer } from "node:buffer";

export const MAX_WALLET_HANDOFF_JSON_BYTES = 3 * 1024 * 1024;

type JsonValue =
  boolean | null | number | string | JsonValue[] | { [key: string]: JsonValue };

type CanonicalState = {
  nodes: number;
  readonly seen: WeakSet<object>;
};

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function visit(
  value: unknown,
  depth: number,
  state: CanonicalState,
): JsonValue {
  state.nodes += 1;
  if (state.nodes > 4_096)
    throw new Error("wallet handoff JSON has too many nodes");
  if (depth > 32) throw new Error("wallet handoff JSON is too deep");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (!value.isWellFormed())
      throw new Error("wallet handoff JSON is not Unicode");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("wallet handoff JSON number is invalid");
    return value;
  }
  if (typeof value !== "object") {
    throw new Error("wallet handoff payload must contain only JSON values");
  }
  if (state.seen.has(value)) throw new Error("wallet handoff JSON is cyclic");
  state.seen.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Object.keys(value);
      if (
        keys.length !== value.length ||
        keys.some((key, index) => key !== String(index))
      ) {
        throw new Error("wallet handoff JSON array is sparse");
      }
      return value.map((entry) => visit(entry, depth + 1, state));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("wallet handoff JSON object is invalid");
    }
    const keys = Object.keys(value);
    if (keys.length > 256)
      throw new Error("wallet handoff JSON object is too wide");
    const result = Object.create(null) as { [key: string]: JsonValue };
    for (const key of keys.sort(utf8Compare)) {
      if (!key.isWellFormed())
        throw new Error("wallet handoff JSON key is invalid");
      result[key] = visit(
        (value as Record<string, unknown>)[key],
        depth + 1,
        state,
      );
    }
    return result;
  } finally {
    state.seen.delete(value);
  }
}

export function encodeCanonicalWalletHandoffJson(value: unknown): Uint8Array {
  const canonical = visit(value, 0, { nodes: 0, seen: new WeakSet() });
  const bytes = new TextEncoder().encode(JSON.stringify(canonical));
  if (bytes.byteLength > MAX_WALLET_HANDOFF_JSON_BYTES) {
    throw new Error("wallet handoff JSON is too large");
  }
  return bytes;
}

export function decodeCanonicalWalletHandoffJson(bytes: Uint8Array): unknown {
  if (bytes.byteLength > MAX_WALLET_HANDOFF_JSON_BYTES) {
    throw new Error("wallet handoff JSON is too large");
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error("wallet handoff JSON must not contain a BOM");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("wallet handoff JSON must be UTF-8");
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error("wallet handoff JSON is invalid");
  }
  const canonical = new TextDecoder().decode(
    encodeCanonicalWalletHandoffJson(value),
  );
  if (canonical !== text)
    throw new Error("wallet handoff JSON is not canonical");
  return value;
}
