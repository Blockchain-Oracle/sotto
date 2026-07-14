import type { Identifier, Value } from "@canton-network/core-ledger-proto";

export const TOKEN_METADATA_PACKAGE_ID =
  "4ded6b668cb3b64f7a88a30874cd41c75829f5e064b3fbbadf41ec7e8363354f";

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

type ScalarKind = "text" | "party" | "numeric" | "timestamp" | "int64";

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
            : sum.int64;
  if (actual !== expected) {
    throw new Error(`prepared ${label} effect value does not match`);
  }
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

function preparedTextMap(value: Value | undefined, label: string) {
  if (value?.sum.oneofKind !== "textMap") {
    throw new Error(`prepared ${label} effect must be a text map`);
  }
  const entries = value.sum.textMap.entries.map((entry) => {
    if (entry.value?.sum.oneofKind !== "text") {
      throw new Error(`prepared ${label} effect contains a non-text value`);
    }
    return [entry.key, entry.value.sum.text] as const;
  });
  if (new Set(entries.map(([key]) => key)).size !== entries.length) {
    throw new Error(`prepared ${label} effect keys repeat`);
  }
  return entries.sort(([left], [right]) => utf8Compare(left, right));
}

export function preparedEmptyMetadata(
  value: Value | undefined,
  label: string,
): void {
  const metadata = preparedRecord(
    value,
    ["values"],
    label,
    `${TOKEN_METADATA_PACKAGE_ID}:Splice.Api.Token.MetadataV1:Metadata`,
  );
  if (preparedTextMap(metadata.get("values"), `${label} values`).length !== 0) {
    throw new Error(`prepared ${label} effect must be empty`);
  }
}

export function preparedExtraArgs(
  value: Value | undefined,
  expectedContext: Readonly<Record<string, unknown>>,
  label: string,
): void {
  const extra = preparedRecord(
    value,
    ["context", "meta"],
    label,
    `${TOKEN_METADATA_PACKAGE_ID}:Splice.Api.Token.MetadataV1:ExtraArgs`,
  );
  const context = preparedRecord(
    extra.get("context"),
    ["values"],
    `${label} context`,
    `${TOKEN_METADATA_PACKAGE_ID}:Splice.Api.Token.MetadataV1:ChoiceContext`,
  );
  const values = expectedContext.values;
  if (
    typeof values !== "object" ||
    values === null ||
    Array.isArray(values) ||
    Object.values(values).some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`prepared ${label} expected context is invalid`);
  }
  const expected = Object.entries(values as Record<string, string>).sort(
    ([left], [right]) => utf8Compare(left, right),
  );
  if (
    JSON.stringify(
      preparedTextMap(context.get("values"), `${label} context`),
    ) !== JSON.stringify(expected)
  ) {
    throw new Error(`prepared ${label} effect context does not match`);
  }
  preparedEmptyMetadata(extra.get("meta"), `${label} metadata`);
}
