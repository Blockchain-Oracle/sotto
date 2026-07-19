import type { Identifier, Value } from "@canton-network/core-ledger-proto";

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function preparedIdentifier(
  actual: Identifier | undefined,
  expected: string,
  label: string,
): void {
  const [packageId, moduleName, entityName] = expected.split(":");
  if (
    actual === undefined ||
    !packageId ||
    !moduleName ||
    !entityName ||
    actual.packageId !== packageId ||
    actual.moduleName !== moduleName ||
    actual.entityName !== entityName
  ) {
    throw new Error(`prepared ${label} effect identifier does not match`);
  }
}

export function preparedParties(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  const canonical = (values: readonly string[]) =>
    [...values].sort(utf8Compare);
  if (
    new Set(actual).size !== actual.length ||
    JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))
  ) {
    throw new Error(`prepared ${label} effect parties do not match`);
  }
}

export function preparedRecord(
  value: Value | undefined,
  expectedFields: readonly string[],
  label: string,
  expectedId?: string,
): Map<string, Value> {
  if (value?.sum.oneofKind !== "record") {
    throw new Error(`prepared ${label} effect must be a record`);
  }
  if (expectedId !== undefined) {
    preparedIdentifier(value.sum.record.recordId, expectedId, label);
  }
  const fields = new Map<string, Value>();
  for (const field of value.sum.record.fields) {
    if (!field.label || field.value === undefined || fields.has(field.label)) {
      throw new Error(`prepared ${label} effect fields are ambiguous`);
    }
    fields.set(field.label, field.value);
  }
  if (
    JSON.stringify([...fields.keys()].sort(utf8Compare)) !==
    JSON.stringify([...expectedFields].sort(utf8Compare))
  ) {
    throw new Error(`prepared ${label} effect fields do not match`);
  }
  return fields;
}

type ScalarKind =
  "text" | "party" | "numeric" | "timestamp" | "int64" | "contractId";

export function preparedScalar(
  value: Value | undefined,
  kind: ScalarKind,
  expected: string,
  label: string,
): void {
  if (value?.sum.oneofKind !== kind) {
    throw new Error(`prepared ${label} effect type does not match`);
  }
  const sum = value.sum;
  const actual =
    sum.oneofKind === "text"
      ? sum.text
      : sum.oneofKind === "party"
        ? sum.party
        : sum.oneofKind === "numeric"
          ? sum.numeric
          : sum.oneofKind === "timestamp"
            ? sum.timestamp
            : sum.oneofKind === "int64"
              ? sum.int64
              : sum.contractId;
  if (actual !== expected) {
    throw new Error(`prepared ${label} effect value does not match`);
  }
}

export function preparedBoolean(
  value: Value | undefined,
  expected: boolean,
  label: string,
): void {
  if (value?.sum.oneofKind !== "bool" || value.sum.bool !== expected) {
    throw new Error(`prepared ${label} effect value does not match`);
  }
}

export function preparedNumeric(
  value: Value | undefined,
  label: string,
): string {
  if (value?.sum.oneofKind !== "numeric") {
    throw new Error(`prepared ${label} effect must be numeric`);
  }
  return value.sum.numeric;
}

export function preparedContractIds(
  value: Value | undefined,
  label: string,
): string[] {
  if (value?.sum.oneofKind !== "list") {
    throw new Error(`prepared ${label} effect must be a contract-ID list`);
  }
  const ids = value.sum.list.elements.map((entry) => {
    if (entry.sum.oneofKind !== "contractId" || !entry.sum.contractId) {
      throw new Error(`prepared ${label} effect contains a non-contract ID`);
    }
    return entry.sum.contractId;
  });
  if (new Set(ids).size !== ids.length) {
    throw new Error(`prepared ${label} effect contract IDs repeat`);
  }
  return ids;
}
