import {
  exactKeys,
  identifier,
  objectValue,
  sha256Hex,
} from "./purchase-commitment-primitives.js";

const CONTEXT_DIGEST_VERSION = "sotto-human-transfer-context-v1";
const MAX_CONTEXT_ENTRIES = 128;
const MAX_CONTEXT_BYTES = 64 * 1_024;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function digestHumanTransferContext(value: unknown): `sha256:${string}` {
  const context = objectValue(value, "human transfer context");
  exactKeys(context, ["values"], "human transfer context");
  const values = objectValue(context.values, "human transfer context values");
  const entries = Object.entries(values);
  if (entries.length === 0 || entries.length > MAX_CONTEXT_ENTRIES) {
    throw new Error("human transfer context entry count is invalid");
  }
  const canonical = entries
    .map(([candidateKey, candidateValue]) => {
      const key = identifier(candidateKey, "human transfer context key", 256);
      if (DANGEROUS_KEYS.has(key)) {
        throw new Error("human transfer context contains a dangerous key");
      }
      const entry = objectValue(
        candidateValue,
        `human transfer context ${key}`,
      );
      exactKeys(entry, ["tag", "value"], `human transfer context ${key}`);
      if (entry.tag !== "AV_ContractId") {
        throw new Error("human transfer context value type is invalid");
      }
      return {
        key,
        contractId: identifier(
          entry.value,
          `human transfer context ${key} contract ID`,
          4_096,
        ),
      };
    })
    .sort((left, right) => utf8Compare(left.key, right.key));
  const semanticContext = {
    values: Object.fromEntries(
      canonical.map(({ key, contractId }) => [
        key,
        { tag: "AV_ContractId", value: contractId },
      ]),
    ),
  };
  if (
    Buffer.byteLength(JSON.stringify(semanticContext), "utf8") >
    MAX_CONTEXT_BYTES
  ) {
    throw new Error("human transfer context exceeds the byte limit");
  }
  const preimage = JSON.stringify({
    version: CONTEXT_DIGEST_VERSION,
    entries: canonical,
  });
  return `sha256:${sha256Hex(preimage)}`;
}
