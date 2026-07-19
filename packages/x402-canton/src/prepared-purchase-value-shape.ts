import { createHash } from "node:crypto";
import type { Identifier, Value } from "@canton-network/core-ledger-proto";

function preparedId(value: Identifier | undefined): string | null {
  return value === undefined
    ? null
    : `${value.packageId}:${value.moduleName}:${value.entityName}`;
}

function descriptor(value: Value | undefined): unknown {
  if (value === undefined) return ["absent"];
  const sum = value.sum;
  switch (sum.oneofKind) {
    case "optional":
      return ["optional", descriptor(sum.optional.value)];
    case "list":
      return ["list", sum.list.elements.map(descriptor)];
    case "textMap":
      return [
        "textMap",
        sum.textMap.entries.map(({ value: entry }) => descriptor(entry)).sort(),
      ];
    case "genMap":
      return [
        "genMap",
        sum.genMap.entries
          .map(({ key, value: entry }) => [descriptor(key), descriptor(entry)])
          .sort(),
      ];
    case "record":
      return [
        "record",
        preparedId(sum.record.recordId),
        sum.record.fields
          .map(({ label, value: field }) => [label, descriptor(field)])
          .sort(([left], [right]) => String(left).localeCompare(String(right))),
      ];
    case "variant":
      return [
        "variant",
        preparedId(sum.variant.variantId),
        sum.variant.constructor,
        descriptor(sum.variant.value),
      ];
    case "enum":
      return ["enum", preparedId(sum.enum.enumId), sum.enum.constructor];
    case undefined:
      return ["absent-kind"];
    default:
      return [sum.oneofKind];
  }
}

export function preparedValueShapeHash(
  value: Value | undefined,
): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(descriptor(value)))
    .digest("hex")}`;
}
