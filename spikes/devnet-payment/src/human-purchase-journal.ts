import type { PersistedHumanSettlementExpectation } from "@sotto/x402-canton/internal/human-settlement-expectation-journal";
import { withOwnerOnlyBootstrapLease } from "./capability-bootstrap-lease.js";
import {
  canonicalHumanIntentPayload,
  humanApprovalPayload,
  humanExecutionPayload,
  humanSignaturePayload,
} from "./human-purchase-journal-payloads.js";
import {
  humanJournalHash,
  humanPurchaseJournalDirectoryName,
  humanPurchaseOperationId,
} from "./human-purchase-journal-primitives.js";
import { createHumanPurchaseJournalRecord } from "./human-purchase-journal-record.js";
import {
  appendHumanPurchaseJournalStage,
  humanPurchaseJournalDirectory,
  loadHumanPurchaseJournalState,
} from "./human-purchase-journal-storage.js";
import type {
  HumanPurchaseJournalState,
  HumanPurchaseOperationId,
} from "./human-purchase-journal-types.js";
import { writeExclusiveCapabilityBootstrapJson } from "./capability-bootstrap-journal-storage.js";

function operationId(value: unknown): HumanPurchaseOperationId {
  return humanJournalHash(
    value,
    "human purchase operation ID",
  ) as HumanPurchaseOperationId;
}

export async function initializeHumanPurchaseJournal(input: {
  beginExclusive: number;
  expectation: PersistedHumanSettlementExpectation;
  workspaceRoot: string;
}) {
  const payload = canonicalHumanIntentPayload({
    beginExclusive: input.beginExclusive,
    expectation: input.expectation,
  });
  const purchaseOperationId = humanPurchaseOperationId(
    payload.expectation.expectation.purchaseCommitment,
  );
  const directory = await humanPurchaseJournalDirectory(
    input.workspaceRoot,
    purchaseOperationId,
  );
  await writeExclusiveCapabilityBootstrapJson(
    directory,
    "00-intent.json",
    createHumanPurchaseJournalRecord({
      kind: "intent",
      operationId: purchaseOperationId,
      payload,
      previousRecordSha256: null,
    }),
  );
  return Object.freeze({
    directoryName: humanPurchaseJournalDirectoryName(purchaseOperationId),
    operationId: purchaseOperationId,
  });
}

export function loadHumanPurchaseJournal(input: {
  operationId: string;
  workspaceRoot: string;
}): Promise<HumanPurchaseJournalState> {
  return loadHumanPurchaseJournalState({
    operationId: operationId(input.operationId),
    workspaceRoot: input.workspaceRoot,
  });
}

type StageInput = Readonly<{ operationId: string; workspaceRoot: string }>;

export function markHumanPurchaseApprovalRequested(
  input: StageInput & Readonly<{ sessionId: string }>,
): Promise<void> {
  return appendHumanPurchaseJournalStage({
    ...input,
    createPayload: () => humanApprovalPayload({ sessionId: input.sessionId }),
    expectedStage: "intent",
    kind: "approval-requested",
    operationId: operationId(input.operationId),
  });
}

export function markHumanPurchaseSignatureVerified(
  input: StageInput &
    Readonly<{ preparedTransactionHash: string; sessionId: string }>,
): Promise<void> {
  return appendHumanPurchaseJournalStage({
    ...input,
    createPayload: (state) =>
      humanSignaturePayload(
        {
          preparedTransactionHash: input.preparedTransactionHash,
          sessionId: input.sessionId,
        },
        state.approvalRequested!.sessionId,
      ),
    expectedStage: "approval-requested",
    kind: "signature-verified",
    operationId: operationId(input.operationId),
  });
}

export function markHumanPurchaseExecutionStarted(
  input: StageInput &
    Readonly<{ sessionId: string; submissionId: string; userId: string }>,
): Promise<void> {
  return appendHumanPurchaseJournalStage({
    ...input,
    createPayload: (state) =>
      humanExecutionPayload(
        {
          sessionId: input.sessionId,
          submissionId: input.submissionId,
          userId: input.userId,
        },
        state.signatureVerified!.sessionId,
      ),
    expectedStage: "signature-verified",
    kind: "execution-started",
    operationId: operationId(input.operationId),
  });
}

export {
  markHumanPurchaseCompletion,
  markHumanPurchaseDelivery,
  markHumanPurchaseSettlementReconciled,
} from "./human-purchase-journal-terminal.js";

export function withHumanPurchaseJournalLease<T>(input: {
  action: (assertOwned: () => Promise<void>) => Promise<T>;
  operationId: string;
  workspaceRoot: string;
}): Promise<T> {
  const purchaseOperationId = operationId(input.operationId);
  return withOwnerOnlyBootstrapLease({
    ...input,
    directoryName: humanPurchaseJournalDirectoryName(purchaseOperationId),
    leaseSchema: "sotto-human-purchase-lease-v1",
    operationId: purchaseOperationId,
  });
}
