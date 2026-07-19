import {
  MAX_PREPARED_TRANSACTION_BYTES,
  MAX_PREPARE_RESPONSE_BYTES,
} from "@sotto/x402-canton";
import {
  parseFiveNorthJson,
  readFiveNorthResponse,
} from "./five-north-response.js";

export function localObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function canonicalBase64(
  value: unknown,
  label: string,
  maximumBytes: number,
): Uint8Array {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label} must be base64`);
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

export function parseLocalPrepareResponse(bytes: Uint8Array): Readonly<{
  participantHash: Uint8Array;
  preparedTransaction: Uint8Array;
}> {
  const response = localObject(
    parseFiveNorthJson(bytes, "local prepare response"),
    "local prepare response",
  );
  const allowed = new Set([
    "preparedTransaction",
    "preparedTransactionHash",
    "hashingSchemeVersion",
    "hashingDetails",
    "costEstimation",
  ]);
  if (Object.keys(response).some((key) => !allowed.has(key))) {
    throw new Error("local prepare response contains an unknown field");
  }
  if (response.hashingSchemeVersion !== "HASHING_SCHEME_VERSION_V2") {
    throw new Error("local prepare response must use hashing scheme V2");
  }
  const preparedTransaction = canonicalBase64(
    response.preparedTransaction,
    "local prepared transaction",
    MAX_PREPARED_TRANSACTION_BYTES,
  );
  const participantHash = canonicalBase64(
    response.preparedTransactionHash,
    "local participant hash",
    32,
  );
  if (
    preparedTransaction.byteLength === 0 ||
    participantHash.byteLength !== 32
  ) {
    throw new Error("local prepare response has invalid byte lengths");
  }
  return Object.freeze({ participantHash, preparedTransaction });
}

export async function readLocalJson(
  response: Response,
  label: string,
): Promise<unknown> {
  return parseFiveNorthJson(
    await readFiveNorthResponse(response, 2_000_000),
    label,
  );
}

export function readLocalPrepareBytes(response: Response): Promise<Uint8Array> {
  return readFiveNorthResponse(response, MAX_PREPARE_RESPONSE_BYTES);
}
