import type { Value } from "@canton-network/core-ledger-proto";
import { preparedRecord } from "./prepared-purchase-effect-values.js";

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
