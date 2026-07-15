import type { CapabilityWalletApprovalRequest } from "@sotto/x402-canton";
import { parseReferenceWalletApproval } from "./reference-wallet-approval.js";
import {
  REFERENCE_WALLET_REQUEST_VERSION,
  REFERENCE_WALLET_RESPONSE_VERSION,
  type ReferenceWalletApprovalResponse,
  type ReferenceWalletRequestPayload,
  type ReferenceWalletResponsePayload,
  type SerializedReferenceWalletRequest,
} from "./reference-wallet-types.js";

const HASH = /^sha256:[0-9a-f]{64}$/u;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  if (Object.keys(value).sort().join() !== [...keys].sort().join()) {
    throw new Error(`${label} keys are invalid`);
  }
}

function hash(value: unknown, label: string): `sha256:${string}` {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as `sha256:${string}`;
}

function canonicalBase64(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("reference wallet prepared transaction is invalid");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > 2 * 1024 * 1024 || bytes.toString("base64") !== value) {
    throw new Error("reference wallet prepared transaction is not canonical");
  }
  return value;
}

function canonicalTime(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(Date.parse(value)).toISOString() !== value
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function exactString(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    !value.isWellFormed() ||
    Buffer.byteLength(value, "utf8") > 512
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

export function serializeReferenceWalletRequest(
  request: CapabilityWalletApprovalRequest,
): ReferenceWalletRequestPayload {
  return Object.freeze({
    request: Object.freeze({
      ...request,
      preparedTransaction: Buffer.from(request.preparedTransaction).toString(
        "base64",
      ),
    }),
    version: REFERENCE_WALLET_REQUEST_VERSION,
  });
}

export function parseReferenceWalletRequest(
  value: unknown,
): SerializedReferenceWalletRequest {
  const envelope = record(value, "reference wallet request envelope");
  exactKeys(envelope, ["request", "version"], "reference wallet request");
  if (envelope.version !== REFERENCE_WALLET_REQUEST_VERSION) {
    throw new Error("reference wallet request version is invalid");
  }
  const request = record(envelope.request, "reference wallet request");
  exactKeys(
    request,
    [
      "approval",
      "capabilityIntentHash",
      "connectorId",
      "connectorOrigin",
      "createdAt",
      "expiresAt",
      "preparedTransaction",
      "preparedTransactionHash",
      "sessionId",
      "version",
    ],
    "reference wallet request",
  );
  if (request.version !== "sotto-capability-wallet-request-v1") {
    throw new Error("reference wallet approval request version is invalid");
  }
  const capabilityIntentHash = hash(
    request.capabilityIntentHash,
    "reference wallet capability hash",
  );
  const preparedTransactionHash = hash(
    request.preparedTransactionHash,
    "reference wallet prepared hash",
  );
  const sessionId = hash(request.sessionId, "reference wallet session ID");
  const createdAt = canonicalTime(
    request.createdAt,
    "reference wallet creation time",
  );
  const expiresAt = canonicalTime(request.expiresAt, "reference wallet expiry");
  const now = Date.now();
  if (
    Date.parse(createdAt) > now ||
    Date.parse(expiresAt) <= now ||
    Date.parse(expiresAt) - Date.parse(createdAt) > 10 * 60 * 1_000
  ) {
    throw new Error("reference wallet approval request is not active");
  }
  return Object.freeze({
    approval: parseReferenceWalletApproval(
      request.approval,
      preparedTransactionHash,
    ),
    capabilityIntentHash,
    connectorId: exactString(
      request.connectorId,
      "reference wallet connector ID",
    ),
    connectorOrigin: exactString(
      request.connectorOrigin,
      "reference wallet connector origin",
    ),
    createdAt,
    expiresAt,
    preparedTransaction: canonicalBase64(request.preparedTransaction),
    preparedTransactionHash,
    sessionId,
    version: "sotto-capability-wallet-request-v1" as const,
  });
}

export function referenceWalletResponsePayload(
  sessionId: `sha256:${string}`,
  response: ReferenceWalletApprovalResponse,
): ReferenceWalletResponsePayload {
  return Object.freeze({
    response,
    sessionId,
    version: REFERENCE_WALLET_RESPONSE_VERSION,
  });
}

export function parseReferenceWalletResponse(
  value: unknown,
  sessionId: string,
): ReferenceWalletApprovalResponse {
  const envelope = record(value, "reference wallet response envelope");
  exactKeys(
    envelope,
    ["response", "sessionId", "version"],
    "reference wallet response",
  );
  if (
    envelope.version !== REFERENCE_WALLET_RESPONSE_VERSION ||
    envelope.sessionId !== sessionId
  ) {
    throw new Error("reference wallet response identity is invalid");
  }
  return envelope.response as ReferenceWalletApprovalResponse;
}
