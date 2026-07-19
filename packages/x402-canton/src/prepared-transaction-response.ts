import { exactKeys, objectValue } from "./purchase-commitment-primitives.js";
import { canonicalDisclosureBlob } from "./purchase-disclosure-validation.js";
import {
  MAX_PREPARE_RESPONSE_BYTES,
  MAX_PREPARED_TRANSACTION_BYTES,
} from "./prepared-purchase-resource-envelope.js";
import { assertStrictJson } from "./strict-json.js";

export type ParsedPreparedTransactionResponse = Readonly<{
  preparedTransaction: Uint8Array;
  preparedTransactionHash: string;
}>;

function validateCostEstimation(value: unknown): void {
  if (value === undefined || value === null) return;
  const cost = objectValue(value, "prepare cost estimation");
  exactKeys(
    cost,
    [
      "estimationTimestamp",
      "confirmationRequestTrafficCostEstimation",
      "confirmationResponseTrafficCostEstimation",
      "totalTrafficCostEstimation",
    ],
    "prepare cost estimation",
  );
  if (
    typeof cost.estimationTimestamp !== "string" ||
    Buffer.byteLength(cost.estimationTimestamp, "utf8") > 64 ||
    [
      cost.confirmationRequestTrafficCostEstimation,
      cost.confirmationResponseTrafficCostEstimation,
      cost.totalTrafficCostEstimation,
    ].some((entry) => !Number.isSafeInteger(entry) || (entry as number) < 0)
  ) {
    throw new Error("prepare cost estimation is invalid");
  }
}

export function parsePreparedTransactionResponse(
  bytes: Uint8Array,
): ParsedPreparedTransactionResponse {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength > MAX_PREPARE_RESPONSE_BYTES
  ) {
    throw new Error("prepare response exceeds byte limit");
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error("prepare response must not contain a BOM");
  }
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("prepare response is not valid UTF-8");
  }
  assertStrictJson(source, 64, 65_536);
  const root = objectValue(JSON.parse(source), "prepare response");
  const responseCore = { ...root };
  delete responseCore.hashingDetails;
  delete responseCore.costEstimation;
  exactKeys(
    responseCore,
    ["preparedTransaction", "preparedTransactionHash", "hashingSchemeVersion"],
    "prepare response",
  );
  if (typeof (root.hashingDetails ?? "") !== "string") {
    throw new Error("prepare hashing details are invalid");
  }
  validateCostEstimation(root.costEstimation);
  if (root.hashingSchemeVersion !== "HASHING_SCHEME_VERSION_V2") {
    throw new Error("prepare response must use hashing scheme V2");
  }
  const transaction = canonicalDisclosureBlob(
    root.preparedTransaction,
    "prepared transaction",
    MAX_PREPARED_TRANSACTION_BYTES,
  );
  const hash = canonicalDisclosureBlob(
    root.preparedTransactionHash,
    "prepared transaction hash",
    32,
  );
  if (hash.bytes !== 32) {
    throw new Error("prepared transaction hash must be a raw SHA-256 digest");
  }
  return Object.freeze({
    preparedTransaction: new Uint8Array(
      Buffer.from(transaction.value, "base64"),
    ),
    preparedTransactionHash: hash.value,
  });
}
