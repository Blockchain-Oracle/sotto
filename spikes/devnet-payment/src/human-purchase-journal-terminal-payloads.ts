import type { HumanSettlementExpectation } from "@sotto/x402-canton";
import { isGoogleRpcStatusCode } from "./canton-status-code.js";
import {
  exactHumanJournalObject as exactObject,
  humanJournalHash as hash,
  humanJournalOffset as offset,
  humanJournalUpdateId as updateId,
} from "./human-purchase-journal-primitives.js";
import {
  MAX_HUMAN_PURCHASE_DELIVERY_BYTES,
  type HumanPurchaseCompletionPayload,
  type HumanPurchaseDeliveryPayload,
  type HumanPurchaseSettlementPayload,
} from "./human-purchase-journal-types.js";

export function humanCompletionPayload(value: unknown, begin: number) {
  const candidate =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const succeeded = candidate.classification === "SUCCEEDED";
  const payload = exactObject(
    value,
    succeeded
      ? ["classification", "completionOffset", "updateId"]
      : ["classification", "completionOffset", "statusCode"],
    "human purchase completion payload",
  );
  const completionOffset = offset(
    payload.completionOffset,
    "human completion offset",
  );
  if (completionOffset <= begin) {
    throw new Error("human purchase completion offset is invalid");
  }
  if (succeeded) {
    return Object.freeze({
      classification: "SUCCEEDED" as const,
      completionOffset,
      updateId: updateId(payload.updateId),
    }) satisfies HumanPurchaseCompletionPayload;
  }
  if (
    payload.classification !== "REJECTED" ||
    !isGoogleRpcStatusCode(payload.statusCode) ||
    payload.statusCode === 0
  ) {
    throw new Error("human purchase rejection status is invalid");
  }
  return Object.freeze({
    classification: "REJECTED" as const,
    completionOffset,
    statusCode: payload.statusCode,
  }) satisfies HumanPurchaseCompletionPayload;
}

export function humanSettlementPayload(
  value: unknown,
  expectation: HumanSettlementExpectation,
  completedUpdateId: string,
) {
  const payload = exactObject(
    value,
    ["proof"],
    "human purchase settlement payload",
  );
  const proof = exactObject(
    payload.proof,
    [
      "attemptId",
      "challengeId",
      "purchaseCommitment",
      "requestCommitment",
      "updateId",
    ],
    "human purchase settlement proof",
  );
  const parsed = Object.freeze({
    attemptId: hash(proof.attemptId, "human settlement attempt ID"),
    challengeId: hash(proof.challengeId, "human settlement challenge ID"),
    requestCommitment: hash(
      proof.requestCommitment,
      "human settlement request commitment",
    ),
    purchaseCommitment: hash(
      proof.purchaseCommitment,
      "human settlement purchase commitment",
    ),
    updateId: updateId(proof.updateId),
  });
  if (
    parsed.attemptId !== expectation.attemptId ||
    parsed.challengeId !== expectation.challengeId ||
    parsed.requestCommitment !== expectation.requestCommitment ||
    parsed.purchaseCommitment !== expectation.purchaseCommitment ||
    parsed.updateId !== completedUpdateId
  ) {
    throw new Error("human purchase settlement proof does not match");
  }
  return Object.freeze({
    proof: parsed,
  }) satisfies HumanPurchaseSettlementPayload;
}

export function humanDeliveryPayload(value: unknown) {
  const payload = exactObject(
    value,
    ["bodyByteCount", "bodySha256", "status"],
    "human purchase delivery payload",
  );
  if (
    payload.status !== 200 ||
    !Number.isSafeInteger(payload.bodyByteCount) ||
    (payload.bodyByteCount as number) < 0 ||
    (payload.bodyByteCount as number) > MAX_HUMAN_PURCHASE_DELIVERY_BYTES
  ) {
    throw new Error("human purchase delivery result is invalid");
  }
  return Object.freeze({
    bodyByteCount: payload.bodyByteCount as number,
    bodySha256: hash(payload.bodySha256, "human delivery body hash"),
    status: 200 as const,
  }) satisfies HumanPurchaseDeliveryPayload;
}
