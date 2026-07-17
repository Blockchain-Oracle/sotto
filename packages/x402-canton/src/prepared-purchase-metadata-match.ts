import type { Value } from "@canton-network/core-ledger-proto";
import { preparedMetadata } from "./prepared-purchase-metadata-values.js";

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function preparedMetadataMatches(
  value: Value | undefined,
  expected: Readonly<Record<string, string>>,
  label: string,
): boolean {
  const entries = Object.entries(expected).sort(([left], [right]) =>
    utf8Compare(left, right),
  );
  return (
    JSON.stringify(preparedMetadata(value, label)) === JSON.stringify(entries)
  );
}
