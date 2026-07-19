import type { HumanSettlementExpectation } from "@sotto/x402-canton";
import type { PersistedHumanSettlementExpectation } from "@sotto/x402-canton/internal/human-settlement-expectation-journal";
import type { HumanPurchaseSettlementProof } from "./human-purchase-provider-reconciliation.js";

export const HUMAN_PURCHASE_JOURNAL_SCHEMA =
  "sotto-human-purchase-journal-v1" as const;
export const MAX_HUMAN_PURCHASE_DELIVERY_BYTES = 2_000_000;

export const HUMAN_PURCHASE_JOURNAL_STAGES = [
  ["00-intent.json", "intent"],
  ["10-approval-requested.json", "approval-requested"],
  ["20-signature-verified.json", "signature-verified"],
  ["30-execution-started.json", "execution-started"],
  ["40-completion.json", "completion"],
  ["50-settlement-reconciled.json", "settlement-reconciled"],
  ["60-delivery.json", "delivery"],
] as const;

export type HumanPurchaseJournalStage =
  (typeof HUMAN_PURCHASE_JOURNAL_STAGES)[number][1];
export type HumanPurchaseOperationId = `sha256:${string}`;
export type HumanPurchaseJournalHash = `sha256:${string}`;

export type HumanPurchaseIntentPayload = Readonly<{
  beginExclusive: number;
  expectation: PersistedHumanSettlementExpectation;
  sourceCommit: string;
}>;
export type HumanPurchaseApprovalPayload = Readonly<{
  sessionId: `sha256:${string}`;
}>;
export type HumanPurchaseSignaturePayload = Readonly<{
  preparedTransactionHash: `sha256:${string}`;
  sessionId: `sha256:${string}`;
}>;
export type HumanPurchaseExecutionPayload = Readonly<{
  sessionId: `sha256:${string}`;
  submissionId: string;
  userId: string;
}>;
export type HumanPurchaseCompletionPayload =
  | Readonly<{
      classification: "SUCCEEDED";
      completionOffset: number;
      updateId: string;
    }>
  | Readonly<{
      classification: "REJECTED";
      completionOffset: number;
      statusCode: number;
    }>;
export type HumanPurchaseSettlementPayload = Readonly<{
  proof: HumanPurchaseSettlementProof;
}>;
export type HumanPurchaseDeliveryPayload = Readonly<{
  bodyByteCount: number;
  bodySha256: `sha256:${string}`;
  status: 200;
}>;

export type HumanPurchaseJournalPayload =
  | HumanPurchaseIntentPayload
  | HumanPurchaseApprovalPayload
  | HumanPurchaseSignaturePayload
  | HumanPurchaseExecutionPayload
  | HumanPurchaseCompletionPayload
  | HumanPurchaseSettlementPayload
  | HumanPurchaseDeliveryPayload;

export type HumanPurchaseJournalRecord = Readonly<{
  kind: HumanPurchaseJournalStage;
  operationId: HumanPurchaseOperationId;
  payload: HumanPurchaseJournalPayload;
  previousRecordSha256: HumanPurchaseJournalHash | null;
  recordedAt: string;
  recordSha256: HumanPurchaseJournalHash;
  schema: typeof HUMAN_PURCHASE_JOURNAL_SCHEMA;
}>;

export type HumanPurchaseJournalState = Readonly<{
  approvalRequested: HumanPurchaseApprovalPayload | null;
  beginExclusive: number;
  completion: HumanPurchaseCompletionPayload | null;
  delivery: HumanPurchaseDeliveryPayload | null;
  directoryName: string;
  executionStarted: HumanPurchaseExecutionPayload | null;
  expectation: HumanSettlementExpectation;
  latestRecordSha256: HumanPurchaseJournalHash;
  latestRecordedAt: string;
  operationId: HumanPurchaseOperationId;
  settlementReconciled: HumanPurchaseSettlementPayload | null;
  signatureVerified: HumanPurchaseSignaturePayload | null;
  sourceCommit: string;
  stage: HumanPurchaseJournalStage;
}>;
