import { identifier, objectValue } from "./purchase-commitment-primitives.js";

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const PACKAGE_ID = /^[0-9a-f]{64}$/u;
const DECIMAL = /^(?:0|[1-9][0-9]*)\.[0-9]{10}$/u;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function persistedHumanSettlementSha(
  value: unknown,
  label: string,
): `sha256:${string}` {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${label} must be a SHA-256 identifier`);
  }
  return value as `sha256:${string}`;
}

export function persistedHumanSettlementPackageId(value: unknown): string {
  if (typeof value !== "string" || !PACKAGE_ID.test(value)) {
    throw new Error("persisted human settlement package ID is invalid");
  }
  return value;
}

export function persistedHumanSettlementAmount(value: unknown): string {
  const amount = identifier(value, "persisted human settlement amount", 128);
  if (!DECIMAL.test(amount) || /^0\.0{10}$/u.test(amount)) {
    throw new Error("persisted human settlement amount is invalid");
  }
  return amount;
}

export function persistedHumanSettlementInputs(
  value: unknown,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 16 ||
    Object.keys(value).length !== value.length
  ) {
    throw new Error("persisted human settlement inputs are invalid");
  }
  const inputs = value.map((entry, index) =>
    identifier(entry, `persisted human settlement input ${index}`, 4_096),
  );
  if (new Set(inputs).size !== inputs.length) {
    throw new Error("persisted human settlement inputs repeat");
  }
  return Object.freeze(inputs);
}

export function persistedHumanSettlementContextIds(
  value: unknown,
): Readonly<Record<string, string>> {
  const context = objectValue(value, "persisted human settlement context IDs");
  const entries = Object.entries(context);
  if (entries.length < 3 || entries.length > 128) {
    throw new Error("persisted human settlement context IDs are invalid");
  }
  const canonical = entries
    .map(([candidateKey, candidateValue]) => {
      const key = identifier(
        candidateKey,
        "persisted human settlement context key",
        256,
      );
      if (DANGEROUS_KEYS.has(key)) {
        throw new Error("persisted human settlement context key is unsafe");
      }
      return [
        key,
        identifier(
          candidateValue,
          `persisted human settlement context ${key}`,
          4_096,
        ),
      ] as const;
    })
    .sort(([left], [right]) => utf8Compare(left, right));
  const restored = Object.freeze(Object.fromEntries(canonical));
  for (const key of [
    "external-party-config-state",
    "featured-app-right",
    "transfer-preapproval",
  ]) {
    if (restored[key] === undefined) {
      throw new Error(`persisted human settlement context ${key} is absent`);
    }
  }
  return restored;
}
