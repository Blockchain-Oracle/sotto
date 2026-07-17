import { isGoogleRpcStatusCode } from "./canton-status-code.js";
import {
  humanJournalKind,
  humanJournalUpdateId,
} from "./human-purchase-journal-primitives.js";
import { MAX_HUMAN_PURCHASE_DELIVERY_BYTES } from "./human-purchase-journal-types.js";

const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const BODY_SHA256 = SHA256;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

function exactString(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function natural(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} is invalid`);
  }
  return value as number;
}

function operationId(value: unknown): `sha256:${string}` {
  return exactString(
    value,
    SHA256,
    "human purchase operation ID",
  ) as `sha256:${string}`;
}

function updateId(value: unknown): string {
  return humanJournalUpdateId(value);
}

function succeededCompletion(value: unknown, includeClassification: boolean) {
  const completion = record(value, "human purchase completion");
  const projected = {
    ...(includeClassification ? { classification: "SUCCEEDED" as const } : {}),
    completionOffset: natural(
      completion.completionOffset,
      "human purchase completion offset",
    ),
    updateId: updateId(completion.updateId),
  };
  if (includeClassification && completion.classification !== "SUCCEEDED") {
    throw new Error("human purchase completion classification is invalid");
  }
  return Object.freeze(projected);
}

function rejectedCompletion(value: unknown) {
  const completion = record(value, "human purchase completion");
  if (completion.classification !== "REJECTED") {
    throw new Error("human purchase completion classification is invalid");
  }
  const statusCode = completion.statusCode;
  if (!isGoogleRpcStatusCode(statusCode) || statusCode === 0) {
    throw new Error("human purchase status is invalid");
  }
  return Object.freeze({
    classification: "REJECTED" as const,
    completionOffset: natural(
      completion.completionOffset,
      "human purchase completion offset",
    ),
    statusCode,
  });
}

function delivery(value: unknown) {
  const candidate = record(value, "human purchase delivery");
  if (candidate.status !== 200) {
    throw new Error("human purchase delivery status is invalid");
  }
  const bodyByteCount = natural(
    candidate.bodyByteCount,
    "human purchase delivery size",
  );
  if (bodyByteCount > MAX_HUMAN_PURCHASE_DELIVERY_BYTES) {
    throw new Error("human purchase delivery size is invalid");
  }
  return Object.freeze({
    bodyByteCount,
    bodySha256: exactString(
      candidate.bodySha256,
      BODY_SHA256,
      "human purchase delivery hash",
    ),
    status: 200 as const,
  });
}

export function projectHumanPurchaseJournalInitialized(
  sourceCommit: string,
  candidateOperationId: unknown,
) {
  return Object.freeze({
    operationId: operationId(candidateOperationId),
    schema: "sotto-five-north-human-purchase-operation-v1" as const,
    sourceCommit: exactString(
      sourceCommit,
      SOURCE_COMMIT,
      "human purchase source commit",
    ),
    status: "journal-initialized" as const,
  });
}

export function projectLiveFiveNorthHumanPurchaseOutput(
  sourceCommit: string,
  value: unknown,
) {
  const result = record(value, "live human purchase result");
  const base = {
    operationId: operationId(result.operationId),
    schema: "sotto-five-north-human-purchase-v1" as const,
    sourceCommit: exactString(
      sourceCommit,
      SOURCE_COMMIT,
      "human purchase source commit",
    ),
  };
  const recoveryBase = () => ({
    ...base,
    priorStage: humanJournalKind(result.priorStage),
  });
  switch (result.status) {
    case "wallet-rejected":
    case "wallet-unsupported":
      return Object.freeze({ ...base, status: result.status });
    case "not-executed":
      return Object.freeze({ ...recoveryBase(), status: result.status });
    case "rejected":
      return Object.freeze({
        ...recoveryBase(),
        completion: rejectedCompletion(result.completion),
        status: result.status,
      });
    case "settled-undelivered":
      return Object.freeze({
        ...recoveryBase(),
        completion: succeededCompletion(result.completion, true),
        status: result.status,
      });
    case "delivered":
      return Object.freeze({
        ...recoveryBase(),
        completion: succeededCompletion(result.completion, true),
        delivery: delivery(result.delivery),
        status: result.status,
      });
    case "paid-resource-delivered":
      return Object.freeze({
        ...base,
        completion: succeededCompletion(result.completion, false),
        delivery: delivery(result.delivery),
        status: result.status,
      });
    default:
      throw new Error("live human purchase result status is invalid");
  }
}
