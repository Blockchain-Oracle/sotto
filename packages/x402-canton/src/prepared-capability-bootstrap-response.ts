import { exactKeys, objectValue } from "./purchase-commitment-primitives.js";
import { assertStrictJson } from "./strict-json.js";
import {
  MAX_PREPARED_CAPABILITY_RESPONSE_BYTES,
  MAX_PREPARED_CAPABILITY_TRANSACTION_BYTES,
} from "./prepared-capability-bootstrap-types.js";

const CORE_RESPONSE_KEYS = [
  "hashingSchemeVersion",
  "preparedTransaction",
  "preparedTransactionHash",
];

function canonicalBase64(
  value: unknown,
  label: string,
  maximumBytes: number,
): Uint8Array {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label} must be nonempty canonical base64`);
  }
  const bytes = new Uint8Array(Buffer.from(value, "base64"));
  if (
    bytes.byteLength > maximumBytes ||
    Buffer.from(bytes).toString("base64") !== value
  ) {
    throw new Error(`${label} must be bounded canonical base64`);
  }
  return bytes;
}

export function parsePreparedCapabilityBootstrapResponse(value: unknown) {
  if (
    !(value instanceof Uint8Array) ||
    value.byteLength === 0 ||
    value.byteLength > MAX_PREPARED_CAPABILITY_RESPONSE_BYTES
  ) {
    throw new Error("prepared capability response bytes are invalid");
  }
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw new Error("prepared capability response must be UTF-8");
  }
  if (source.charCodeAt(0) === 0xfeff) {
    throw new Error("prepared capability response must not contain a BOM");
  }
  assertStrictJson(source, 8, 64);
  const response = objectValue(
    JSON.parse(source) as unknown,
    "prepared capability response",
  );
  const core = { ...response };
  delete core.hashingDetails;
  delete core.costEstimation;
  try {
    exactKeys(core, CORE_RESPONSE_KEYS, "prepared capability response");
  } catch {
    throw new Error("prepared capability response fields do not match");
  }
  if (
    response.hashingDetails !== undefined &&
    response.hashingDetails !== null &&
    typeof response.hashingDetails !== "string"
  ) {
    throw new Error("prepared capability hashing details are invalid");
  }
  if (
    response.costEstimation !== undefined &&
    response.costEstimation !== null
  ) {
    const cost = objectValue(
      response.costEstimation,
      "prepared capability cost estimation",
    );
    exactKeys(
      cost,
      [
        "estimationTimestamp",
        "confirmationRequestTrafficCostEstimation",
        "confirmationResponseTrafficCostEstimation",
        "totalTrafficCostEstimation",
      ],
      "prepared capability cost estimation",
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
      throw new Error("prepared capability cost estimation is invalid");
    }
  }
  if (response.hashingSchemeVersion !== "HASHING_SCHEME_VERSION_V2") {
    throw new Error("prepared capability response must use hashing scheme V2");
  }
  const preparedTransaction = canonicalBase64(
    response.preparedTransaction,
    "prepared capability prepared transaction",
    MAX_PREPARED_CAPABILITY_TRANSACTION_BYTES,
  );
  const participantHash = canonicalBase64(
    response.preparedTransactionHash,
    "prepared capability participant hash",
    32,
  );
  if (participantHash.byteLength !== 32) {
    throw new Error("prepared capability participant hash must be 32 bytes");
  }
  return Object.freeze({
    preparedTransaction,
    preparedTransactionHash: Buffer.from(participantHash).toString("base64"),
  });
}
