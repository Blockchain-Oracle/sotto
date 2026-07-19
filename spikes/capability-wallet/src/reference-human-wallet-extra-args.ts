import { createHash } from "node:crypto";
import type { Value } from "@canton-network/core-ledger-proto";
import { validateReferenceHumanWalletEmptyMetadata } from "./reference-human-wallet-token-metadata.js";
import {
  referenceHumanIdentifier,
  referenceHumanRecord,
} from "./reference-human-wallet-values.js";
import { REFERENCE_HUMAN_TOKEN_METADATA_PACKAGE_ID } from "./reference-human-wallet-token-metadata.js";

const ANY_VALUE_ID = `${REFERENCE_HUMAN_TOKEN_METADATA_PACKAGE_ID}:Splice.Api.Token.MetadataV1:AnyValue`;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_CONTEXT_BYTES = 64 * 1_024;

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

function bounded(value: string, maximumBytes: number): boolean {
  if (
    value === "" ||
    value.trim() !== value ||
    !value.isWellFormed() ||
    Buffer.byteLength(value, "utf8") > maximumBytes
  ) {
    return false;
  }
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  return true;
}

export function readReferenceHumanWalletContractContext(
  value: Value | undefined,
  expectedHash: string,
  label: string,
): ReadonlyMap<string, string> {
  const extra = referenceHumanRecord(
    value,
    ["context", "meta"],
    label,
    `${REFERENCE_HUMAN_TOKEN_METADATA_PACKAGE_ID}:Splice.Api.Token.MetadataV1:ExtraArgs`,
  );
  const context = referenceHumanRecord(
    extra.get("context"),
    ["values"],
    `${label} context`,
    `${REFERENCE_HUMAN_TOKEN_METADATA_PACKAGE_ID}:Splice.Api.Token.MetadataV1:ChoiceContext`,
  );
  const values = context.get("values");
  if (values?.sum.oneofKind !== "textMap") fail(`${label} context`);
  if (
    values.sum.textMap.entries.length === 0 ||
    values.sum.textMap.entries.length > 128
  ) {
    fail(`${label} context`);
  }
  const result = new Map<string, string>();
  for (const { key, value: entry } of values.sum.textMap.entries) {
    if (
      !bounded(key, 256) ||
      DANGEROUS_KEYS.has(key) ||
      result.has(key) ||
      entry?.sum.oneofKind !== "variant" ||
      entry.sum.variant.constructor !== "AV_ContractId" ||
      entry.sum.variant.value?.sum.oneofKind !== "contractId" ||
      !bounded(entry.sum.variant.value.sum.contractId, 4_096)
    ) {
      fail(`${label} context`);
    }
    referenceHumanIdentifier(
      entry.sum.variant.variantId,
      ANY_VALUE_ID,
      `${label} context value`,
    );
    result.set(key, entry.sum.variant.value.sum.contractId);
  }
  const entries = [...result.entries()]
    .sort(([left], [right]) =>
      Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
    )
    .map(([key, contractId]) => ({ key, contractId }));
  const contextBytes = Buffer.byteLength(
    JSON.stringify({
      values: Object.fromEntries(
        entries.map(({ key, contractId }) => [
          key,
          { tag: "AV_ContractId", value: contractId },
        ]),
      ),
    }),
    "utf8",
  );
  const digest = `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        version: "sotto-human-transfer-context-v1",
        entries,
      }),
    )
    .digest("hex")}`;
  if (contextBytes > MAX_CONTEXT_BYTES || digest !== expectedHash) {
    fail(`${label} context hash`);
  }
  validateReferenceHumanWalletEmptyMetadata(
    extra.get("meta"),
    `${label} metadata`,
  );
  return result;
}
