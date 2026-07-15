import { randomBytes } from "node:crypto";

export const OPENRPC_METHOD_NOT_FOUND = Symbol("OpenRPC method not found");

export function openRpcObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new Error(`${label} keys are invalid`);
  }
}

function readError(value: unknown): typeof OPENRPC_METHOD_NOT_FOUND {
  const error = openRpcObject(value, "OpenRPC wallet error");
  const keys = Object.keys(error).sort();
  const validKeys =
    JSON.stringify(keys) === JSON.stringify(["code", "message"]) ||
    JSON.stringify(keys) === JSON.stringify(["code", "data", "message"]);
  if (
    !validKeys ||
    !Number.isSafeInteger(error.code) ||
    typeof error.message !== "string" ||
    error.message.length < 1 ||
    error.message.length > 512
  ) {
    throw new Error("OpenRPC wallet error object is invalid");
  }
  if (error.code === -32601) return OPENRPC_METHOD_NOT_FOUND;
  throw new Error(`OpenRPC wallet provider returned error code ${error.code}`);
}

export function readOpenRpcResult(
  value: unknown,
  expectedId: string,
): unknown | typeof OPENRPC_METHOD_NOT_FOUND {
  const response = openRpcObject(value, "OpenRPC wallet response");
  if ("error" in response) {
    exactKeys(response, ["error", "id", "jsonrpc"], "OpenRPC error response");
    if (response.jsonrpc !== "2.0" || response.id !== expectedId) {
      throw new Error("OpenRPC wallet response identity is invalid");
    }
    return readError(response.error);
  }
  exactKeys(response, ["id", "jsonrpc", "result"], "OpenRPC result response");
  if (response.jsonrpc !== "2.0" || response.id !== expectedId) {
    throw new Error("OpenRPC wallet response identity is invalid");
  }
  return response.result;
}

export function createOpenRpcRequest<Method extends string>(
  method: Method,
  params: Readonly<Record<string, unknown>>,
) {
  return Object.freeze({
    id: `sotto-openrpc-${randomBytes(16).toString("hex")}` as const,
    jsonrpc: "2.0" as const,
    method,
    params,
  });
}
