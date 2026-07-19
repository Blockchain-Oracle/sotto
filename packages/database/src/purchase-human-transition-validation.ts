import {
  exactKeys,
  objectValue,
  sha256,
  time,
  uuid,
} from "./publication-validation-primitives.js";
import { PurchasePersistenceError } from "./purchase-types.js";

const CONNECTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const USER_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,511}$/u;
const REASON = /^[a-z][a-z0-9-]{0,127}$/u;

function connector(value: Record<string, unknown>) {
  if (
    (value.connectorKind !== "openrpc" &&
      value.connectorKind !== "wallet-sdk") ||
    typeof value.connectorId !== "string" ||
    !CONNECTOR_ID.test(value.connectorId)
  ) {
    throw new PurchasePersistenceError();
  }
  return {
    connectorId: value.connectorId,
    connectorKind: value.connectorKind,
  } as const;
}

export function approvalTransitionInput(candidate: unknown) {
  const value = objectValue(candidate, "human approval transition");
  exactKeys(
    value,
    [
      "attemptId",
      "preparedTransactionHash",
      "connectorId",
      "connectorKind",
      "sessionId",
    ],
    "human approval transition",
  );
  return Object.freeze({
    attemptId: sha256(value.attemptId, "human approval attempt ID"),
    preparedTransactionHash: sha256(
      value.preparedTransactionHash,
      "human approval prepared hash",
    ),
    ...connector(value),
    sessionId: sha256(value.sessionId, "human approval session ID"),
  });
}

export function walletDecisionInput(candidate: unknown) {
  const value = objectValue(candidate, "human wallet decision");
  if (value.outcome !== "rejected" && value.outcome !== "unsupported") {
    throw new PurchasePersistenceError();
  }
  const rejected = value.outcome === "rejected";
  exactKeys(
    value,
    rejected
      ? [
          "attemptId",
          "preparedTransactionHash",
          "connectorId",
          "connectorKind",
          "outcome",
          "reason",
          "sessionId",
        ]
      : [
          "attemptId",
          "preparedTransactionHash",
          "connectorId",
          "connectorKind",
          "outcome",
          "reason",
        ],
    "human wallet decision",
  );
  if (
    typeof value.reason !== "string" ||
    !REASON.test(value.reason) ||
    (rejected && value.reason !== "user-rejected") ||
    (!rejected && !value.reason.startsWith("unsupported-"))
  ) {
    throw new PurchasePersistenceError();
  }
  return Object.freeze({
    attemptId: sha256(value.attemptId, "human wallet decision attempt ID"),
    preparedTransactionHash: sha256(
      value.preparedTransactionHash,
      "human wallet decision prepared hash",
    ),
    ...connector(value),
    outcome: value.outcome,
    reason: value.reason,
    ...(rejected
      ? { sessionId: sha256(value.sessionId, "human wallet session ID") }
      : {}),
  });
}

export function signatureTransitionInput(candidate: unknown) {
  const value = objectValue(candidate, "human signature transition");
  exactKeys(
    value,
    [
      "attemptId",
      "preparedTransactionHash",
      "connectorId",
      "connectorKind",
      "sessionId",
      "verifiedAt",
    ],
    "human signature transition",
  );
  return Object.freeze({
    ...approvalTransitionInput({
      attemptId: value.attemptId,
      preparedTransactionHash: value.preparedTransactionHash,
      connectorId: value.connectorId,
      connectorKind: value.connectorKind,
      sessionId: value.sessionId,
    }),
    verifiedAt: time(value.verifiedAt, "human signature verification time"),
  });
}

export function executionTransitionInput(candidate: unknown) {
  const value = objectValue(candidate, "human execution transition");
  exactKeys(
    value,
    [
      "attemptId",
      "commandId",
      "preparedTransactionHash",
      "sessionId",
      "submissionId",
      "userId",
    ],
    "human execution transition",
  );
  if (
    typeof value.commandId !== "string" ||
    !/^sotto-human-purchase-v1-[0-9a-f]{64}$/u.test(value.commandId) ||
    typeof value.userId !== "string" ||
    !USER_ID.test(value.userId)
  ) {
    throw new PurchasePersistenceError();
  }
  return Object.freeze({
    attemptId: sha256(value.attemptId, "human execution attempt ID"),
    commandId: value.commandId,
    preparedTransactionHash: sha256(
      value.preparedTransactionHash,
      "human execution prepared hash",
    ),
    sessionId: sha256(value.sessionId, "human execution session ID"),
    submissionId: uuid(value.submissionId, "human execution submission ID"),
    userId: value.userId,
  });
}
