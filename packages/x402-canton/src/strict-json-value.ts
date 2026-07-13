import { objectValue } from "./purchase-commitment-primitives.js";

export type StrictJsonValue =
  null | boolean | number | string | StrictJsonArray | StrictJsonObject;

export interface StrictJsonArray extends ReadonlyArray<StrictJsonValue> {
  readonly [index: number]: StrictJsonValue;
}

export interface StrictJsonObject {
  readonly [key: string]: StrictJsonValue;
}

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

type Limits = Readonly<{
  maximumBytes: number;
  maximumDepth: number;
  maximumNodes: number;
}>;

function copyJson(
  value: unknown,
  label: string,
  limits: Limits,
  depth: number,
  state: { nodes: number },
): StrictJsonValue {
  if (depth > limits.maximumDepth || ++state.nodes > limits.maximumNodes) {
    throw new Error(`${label} exceeds structural limits`);
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${label} is not strict JSON`);
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((item) => copyJson(item, label, limits, depth + 1, state)),
    );
  }
  const input = objectValue(value, label);
  const result = Object.create(null) as Record<string, StrictJsonValue>;
  for (const key of Object.keys(input)) {
    if (DANGEROUS_KEYS.has(key)) {
      throw new Error(`${label} contains a dangerous key`);
    }
    result[key] = copyJson(input[key], label, limits, depth + 1, state);
  }
  return Object.freeze(result);
}

export function snapshotStrictJsonObject(
  value: unknown,
  label: string,
  limits: Limits,
): Readonly<Record<string, StrictJsonValue>> {
  const result = copyJson(value, label, limits, 0, { nodes: 0 });
  const object = objectValue(result, label) as Readonly<
    Record<string, StrictJsonValue>
  >;
  if (Buffer.byteLength(JSON.stringify(object), "utf8") > limits.maximumBytes) {
    throw new Error(`${label} exceeds byte limit`);
  }
  return object;
}
