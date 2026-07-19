import type { Identifier, Value } from "@canton-network/core-ledger-proto";

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

export function referenceHumanIdentifier(
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
    fail(`${label} identifier`);
  }
}

export function referenceHumanParties(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  const order = (values: readonly string[]) =>
    [...values].sort((left, right) =>
      Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
    );
  if (
    new Set(actual).size !== actual.length ||
    JSON.stringify(order(actual)) !== JSON.stringify(order(expected))
  ) {
    fail(`${label} parties`);
  }
}

export function referenceHumanRecord(
  value: Value | undefined,
  fields: readonly string[],
  label: string,
  recordId?: string,
): Map<string, Value> {
  if (value?.sum.oneofKind !== "record") fail(`${label} record`);
  if (recordId !== undefined) {
    referenceHumanIdentifier(value.sum.record.recordId, recordId, label);
  }
  const entries = new Map<string, Value>();
  for (const field of value.sum.record.fields) {
    if (!field.label || field.value === undefined || entries.has(field.label)) {
      fail(`${label} fields`);
    }
    entries.set(field.label, field.value);
  }
  if (
    JSON.stringify([...entries.keys()].sort()) !==
    JSON.stringify([...fields].sort())
  ) {
    fail(`${label} fields`);
  }
  return entries;
}

type ScalarKind = "numeric" | "party" | "text" | "timestamp";

export function referenceHumanScalar(
  value: Value | undefined,
  kind: ScalarKind,
  expected: string,
  label: string,
): void {
  if (value?.sum.oneofKind !== kind) fail(`${label} type`);
  const actual =
    value.sum.oneofKind === "numeric"
      ? value.sum.numeric
      : value.sum.oneofKind === "party"
        ? value.sum.party
        : value.sum.oneofKind === "text"
          ? value.sum.text
          : value.sum.timestamp;
  if (actual !== expected) fail(`${label} value`);
}

export function referenceHumanDecimal(atomic: string): string {
  if (!/^(?:0|[1-9][0-9]{0,20})$/u.test(atomic)) {
    fail("amount");
  }
  const padded = atomic.padStart(11, "0");
  return `${padded.slice(0, -10)}.${padded.slice(-10)}`;
}
