import {
  exportHumanSettlementExpectation,
  restoreHumanSettlementExpectation,
  type PersistedHumanSettlementExpectation,
} from "@sotto/x402-canton/internal/human-settlement-expectation-journal";
import {
  exactHumanJournalObject as exactObject,
  humanJournalHash as hash,
  humanJournalIdentifier as identifier,
  humanJournalOffset as offset,
  humanJournalUuid as uuid,
} from "./human-purchase-journal-primitives.js";
import {
  type HumanPurchaseApprovalPayload,
  type HumanPurchaseExecutionPayload,
  type HumanPurchaseIntentPayload,
  type HumanPurchaseSignaturePayload,
} from "./human-purchase-journal-types.js";

export function untrustedHumanIntentPayload(
  value: unknown,
): HumanPurchaseIntentPayload {
  const payload = exactObject(
    value,
    ["beginExclusive", "expectation"],
    "human purchase intent payload",
  );
  const expectation = exactObject(
    payload.expectation,
    ["authorityDigest", "expectation", "schema"],
    "persisted human settlement expectation",
  );
  return Object.freeze({
    beginExclusive: offset(payload.beginExclusive, "human completion begin"),
    expectation: expectation as PersistedHumanSettlementExpectation,
  });
}

export function restoreHumanIntentPayload(value: HumanPurchaseIntentPayload) {
  const expectation = restoreHumanSettlementExpectation(value.expectation);
  return Object.freeze({
    beginExclusive: value.beginExclusive,
    expectation,
    persistedExpectation: exportHumanSettlementExpectation(expectation),
  });
}

export function canonicalHumanIntentPayload(value: unknown) {
  const untrusted = untrustedHumanIntentPayload(value);
  const restored = restoreHumanIntentPayload(untrusted);
  return Object.freeze({
    beginExclusive: restored.beginExclusive,
    expectation: restored.persistedExpectation,
  });
}

export function humanApprovalPayload(value: unknown) {
  const payload = exactObject(
    value,
    ["sessionId"],
    "human purchase approval payload",
  );
  return Object.freeze({
    sessionId: hash(payload.sessionId, "human wallet session ID"),
  }) satisfies HumanPurchaseApprovalPayload;
}

export function humanSignaturePayload(value: unknown, sessionId: string) {
  const payload = exactObject(
    value,
    ["preparedTransactionHash", "sessionId"],
    "human purchase signature payload",
  );
  const parsed = Object.freeze({
    preparedTransactionHash: hash(
      payload.preparedTransactionHash,
      "human prepared transaction hash",
    ),
    sessionId: hash(payload.sessionId, "human wallet session ID"),
  }) satisfies HumanPurchaseSignaturePayload;
  if (parsed.sessionId !== sessionId) {
    throw new Error("human purchase signature session does not match");
  }
  return parsed;
}

export function humanExecutionPayload(value: unknown, sessionId: string) {
  const payload = exactObject(
    value,
    ["sessionId", "submissionId", "userId"],
    "human purchase execution payload",
  );
  const parsed = Object.freeze({
    sessionId: hash(payload.sessionId, "human wallet session ID"),
    submissionId: uuid(payload.submissionId),
    userId: identifier(payload.userId, "human execution user ID", 255),
  }) satisfies HumanPurchaseExecutionPayload;
  if (parsed.sessionId !== sessionId) {
    throw new Error("human purchase execution session does not match");
  }
  return parsed;
}
