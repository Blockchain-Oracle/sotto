import type { Value } from "@canton-network/core-ledger-proto";
import {
  preparedIdentifier,
  preparedRecord,
} from "./prepared-purchase-effect-values.js";

export const TOKEN_METADATA_PACKAGE_ID =
  "4ded6b668cb3b64f7a88a30874cd41c75829f5e064b3fbbadf41ec7e8363354f";

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
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

const ANY_VALUE_ID = `${TOKEN_METADATA_PACKAGE_ID}:Splice.Api.Token.MetadataV1:AnyValue`;

function expectedContractIdContext(
  value: unknown,
  label: string,
): ReadonlyArray<readonly [string, string]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`prepared ${label} expected context is invalid`);
  }
  return Object.entries(value as Record<string, unknown>)
    .map(([key, candidate]) => {
      if (
        typeof candidate !== "object" ||
        candidate === null ||
        Array.isArray(candidate)
      ) {
        throw new Error(`prepared ${label} expected context is invalid`);
      }
      const record = candidate as Record<string, unknown>;
      if (
        Object.keys(record).sort().join(",") !== "tag,value" ||
        record.tag !== "AV_ContractId" ||
        typeof record.value !== "string" ||
        record.value === ""
      ) {
        throw new Error(`prepared ${label} expected context is invalid`);
      }
      return [key, record.value] as const;
    })
    .sort(([left], [right]) => utf8Compare(left, right));
}

function preparedContractIdContext(
  value: Value | undefined,
  label: string,
): ReadonlyArray<readonly [string, string]> {
  if (value?.sum.oneofKind !== "textMap") {
    throw new Error(`prepared ${label} effect must be a text map`);
  }
  const entries = value.sum.textMap.entries.map(({ key, value: entry }) => {
    if (entry?.sum.oneofKind !== "variant") {
      throw new Error(`prepared ${label} effect contains a non-AnyValue`);
    }
    const variant = entry.sum.variant;
    preparedIdentifier(variant.variantId, ANY_VALUE_ID, `${label} AnyValue`);
    if (
      variant.constructor !== "AV_ContractId" ||
      variant.value?.sum.oneofKind !== "contractId" ||
      variant.value.sum.contractId === ""
    ) {
      throw new Error(`prepared ${label} effect AnyValue does not match`);
    }
    return [key, variant.value.sum.contractId] as const;
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
  if (preparedMetadata(value, label).length !== 0) {
    throw new Error(`prepared ${label} effect must be empty`);
  }
}

export function preparedMetadata(
  value: Value | undefined,
  label: string,
): ReadonlyArray<readonly [string, string]> {
  const metadata = preparedRecord(
    value,
    ["values"],
    label,
    `${TOKEN_METADATA_PACKAGE_ID}:Splice.Api.Token.MetadataV1:Metadata`,
  );
  const entries = preparedTextMap(metadata.get("values"), `${label} values`);
  if (
    entries.length > 128 ||
    entries.some(
      ([key, entry]) =>
        key === "" ||
        Buffer.byteLength(key, "utf8") > 256 ||
        Buffer.byteLength(entry, "utf8") > 4_096,
    )
  ) {
    throw new Error(`prepared ${label} effect exceeds metadata limits`);
  }
  return Object.freeze(entries);
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
  if (typeof values !== "object" || values === null || Array.isArray(values)) {
    throw new Error(`prepared ${label} expected context is invalid`);
  }
  const expected = expectedContractIdContext(values, label);
  if (
    JSON.stringify(
      preparedContractIdContext(context.get("values"), `${label} context`),
    ) !== JSON.stringify(expected)
  ) {
    throw new Error(`prepared ${label} effect context does not match`);
  }
  preparedEmptyMetadata(extra.get("meta"), `${label} metadata`);
}
