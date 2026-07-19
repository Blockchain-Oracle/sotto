import type { Identifier, Value } from "@canton-network/core-ledger-proto";

function identifier(value: Identifier | undefined): string {
  if (
    value === undefined ||
    !value.packageId ||
    !value.moduleName ||
    !value.entityName
  ) {
    throw new Error("reference wallet prepared identifier is invalid");
  }
  return `${value.packageId}:${value.moduleName}:${value.entityName}`;
}

export function requirePreparedIdentifier(
  value: Identifier | undefined,
  expected: string,
  label: string,
): void {
  if (identifier(value) !== expected) {
    throw new Error(`reference wallet prepared ${label} does not match`);
  }
}

export function requirePreparedParties(
  value: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  const canonical = (parties: readonly string[]) => [...parties].sort();
  if (
    new Set(value).size !== value.length ||
    JSON.stringify(canonical(value)) !== JSON.stringify(canonical(expected))
  ) {
    throw new Error(`reference wallet prepared ${label} do not match`);
  }
}

export function preparedRecord(
  value: Value | undefined,
  expectedFields: readonly string[],
  label: string,
  expectedId?: string,
): Map<string, Value> {
  if (value?.sum.oneofKind !== "record") {
    throw new Error(`reference wallet prepared ${label} must be a record`);
  }
  if (expectedId !== undefined) {
    requirePreparedIdentifier(value.sum.record.recordId, expectedId, label);
  }
  const fields = new Map<string, Value>();
  for (const field of value.sum.record.fields) {
    if (!field.label || field.value === undefined || fields.has(field.label)) {
      throw new Error(`reference wallet prepared ${label} is ambiguous`);
    }
    fields.set(field.label, field.value);
  }
  if (
    JSON.stringify([...fields.keys()].sort()) !==
    JSON.stringify([...expectedFields].sort())
  ) {
    throw new Error(`reference wallet prepared ${label} fields do not match`);
  }
  return fields;
}

type ScalarKind =
  "contractId" | "int64" | "numeric" | "party" | "text" | "timestamp";

export function requirePreparedScalar(
  value: Value | undefined,
  kind: ScalarKind,
  expected: string,
  label: string,
): void {
  if (value?.sum.oneofKind !== kind) {
    throw new Error(`reference wallet prepared ${label} type does not match`);
  }
  const sum = value.sum;
  const actual =
    sum.oneofKind === "contractId"
      ? sum.contractId
      : sum.oneofKind === "int64"
        ? sum.int64
        : sum.oneofKind === "numeric"
          ? sum.numeric
          : sum.oneofKind === "party"
            ? sum.party
            : sum.oneofKind === "text"
              ? sum.text
              : sum.timestamp;
  if (actual !== expected) {
    throw new Error(`reference wallet prepared ${label} does not match`);
  }
}

export function requirePreparedBoolean(
  value: Value | undefined,
  expected: boolean,
  label: string,
): void {
  if (value?.sum.oneofKind !== "bool" || value.sum.bool !== expected) {
    throw new Error(`reference wallet prepared ${label} does not match`);
  }
}
