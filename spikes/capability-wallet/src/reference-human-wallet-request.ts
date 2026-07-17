import type {
  HumanWalletApprovalRequest,
  HumanWalletConnectorKind,
} from "@sotto/x402-canton";
import { parseReferenceHumanWalletApproval } from "./reference-human-wallet-approval.js";
import {
  referenceHumanWalletHash,
  referenceHumanWalletIdentifier,
  referenceHumanWalletPreparedBase64,
  referenceHumanWalletRecord,
  referenceHumanWalletTime,
} from "./reference-human-wallet-data.js";

export const REFERENCE_HUMAN_WALLET_REQUEST_VERSION =
  "sotto-reference-human-wallet-request-v1" as const;

export type SerializedReferenceHumanWalletRequest = Omit<
  HumanWalletApprovalRequest,
  "preparedTransaction"
> &
  Readonly<{ preparedTransaction: string }>;

export type ReferenceHumanWalletRequestPayload = Readonly<{
  request: SerializedReferenceHumanWalletRequest;
  version: typeof REFERENCE_HUMAN_WALLET_REQUEST_VERSION;
}>;

const REQUEST_FIELDS = [
  "approval",
  "connectorId",
  "connectorKind",
  "connectorOrigin",
  "createdAt",
  "expiresAt",
  "hashingSchemeVersion",
  "preparedTransaction",
  "preparedTransactionHash",
  "sessionId",
  "version",
] as const;

function connectorKind(value: unknown): HumanWalletConnectorKind {
  if (value !== "wallet-sdk") {
    throw new Error("reference human wallet request connector kind is invalid");
  }
  return value;
}

export function parseReferenceHumanWalletRequest(
  value: unknown,
): SerializedReferenceHumanWalletRequest {
  const envelope = referenceHumanWalletRecord(
    value,
    ["request", "version"],
    "envelope",
  );
  if (envelope.version !== REFERENCE_HUMAN_WALLET_REQUEST_VERSION) {
    throw new Error(
      "reference human wallet request envelope version is invalid",
    );
  }
  const request = referenceHumanWalletRecord(
    envelope.request,
    REQUEST_FIELDS,
    "payload",
  );
  if (
    request.version !== "sotto-human-wallet-request-v1" ||
    request.hashingSchemeVersion !== "HASHING_SCHEME_VERSION_V2"
  ) {
    throw new Error("reference human wallet request protocol is invalid");
  }
  const preparedTransactionHash = referenceHumanWalletHash(
    request.preparedTransactionHash,
    "prepared hash",
  );
  const approval = parseReferenceHumanWalletApproval(
    request.approval,
    preparedTransactionHash,
  );
  const createdAt = referenceHumanWalletTime(
    request.createdAt,
    "creation time",
  );
  const expiresAt = referenceHumanWalletTime(request.expiresAt, "expiry");
  const now = Date.now();
  if (
    Date.parse(createdAt) > now ||
    Date.parse(expiresAt) <= now ||
    Date.parse(expiresAt) - Date.parse(createdAt) > 10 * 60 * 1_000 ||
    Date.parse(expiresAt) > Date.parse(approval.executeBefore)
  ) {
    throw new Error("reference human wallet request is not active");
  }
  return Object.freeze({
    version: "sotto-human-wallet-request-v1",
    approval,
    connectorId: referenceHumanWalletIdentifier(
      request.connectorId,
      "connector ID",
    ),
    connectorKind: connectorKind(request.connectorKind),
    connectorOrigin: referenceHumanWalletIdentifier(
      request.connectorOrigin,
      "connector origin",
    ),
    createdAt,
    expiresAt,
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
    preparedTransaction: referenceHumanWalletPreparedBase64(
      request.preparedTransaction,
    ),
    preparedTransactionHash,
    sessionId: referenceHumanWalletHash(request.sessionId, "session ID"),
  });
}

export function serializeReferenceHumanWalletRequest(
  request: HumanWalletApprovalRequest,
): ReferenceHumanWalletRequestPayload {
  const envelope = {
    version: REFERENCE_HUMAN_WALLET_REQUEST_VERSION,
    request: {
      ...request,
      preparedTransaction: Buffer.from(request.preparedTransaction).toString(
        "base64",
      ),
    },
  };
  const parsed = parseReferenceHumanWalletRequest(envelope);
  return Object.freeze({
    version: REFERENCE_HUMAN_WALLET_REQUEST_VERSION,
    request: parsed,
  });
}
