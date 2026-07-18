import { afterAll, beforeAll, expect, it } from "vitest";
import { createPurchaseTestRuntime } from "./purchase-postgres.fixtures.js";
import type { ReconciliationTestContext } from "./human-reconciliation.postgres.fixture.js";
import {
  claimTerminalAttempt,
  rejectedCheckpoint,
  succeededCheckpoint,
  TERMINAL_UPDATE_A,
} from "./human-reconciliation-fence.postgres.fixture.js";
import { terminalSnapshot } from "./human-reconciliation-fence-state.postgres.fixture.js";

let context: ReconciliationTestContext;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_reconciliation_fence");
});

afterAll(async () => context?.database.drop());

it("atomically records an exact reconciled settlement", async () => {
  const attempt = await claimTerminalAttempt(context, 573, "terminal-success");
  try {
    const result = await attempt.terminal.completeHumanReconciliation(
      succeededCheckpoint(attempt.claim),
    );
    expect(result).toMatchObject({
      outcome: "created",
      attemptId: attempt.initialized.attemptId,
      state: "settlement-reconciled",
      completion: {
        classification: "SUCCEEDED",
        completionOffset: 43,
      },
      reconciliationOffset: 42,
      event: { sequence: 6, type: "settlement-reconciled" },
      job: {
        state: "completed",
        leaseGeneration: attempt.claim.lease.leaseGeneration,
        resultEventSequence: 6,
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.reconciledAt).toBe(result.event.recordedAt);
    expect(result.reconciledAt).toBe(result.job.completedAt);
    const snapshot = await terminalSnapshot(
      context,
      attempt.initialized.attemptId,
    );
    expect(snapshot).toMatchObject({
      attemptState: "settlement-reconciled",
      commandId: attempt.initialized.commandId,
      submissionId: attempt.execution.submissionId,
      executionUserId: attempt.execution.userId,
      settlementState: "settlement-reconciled",
      reconciliationOffset: "42",
      completionOffset: "43",
      updateId: TERMINAL_UPDATE_A,
      rejectionStatusCode: null,
      eventType: "settlement-reconciled",
      eventHash: result.event.eventHash,
      previousEventHash: result.event.previousEventHash,
      eventCompletionOffset: "43",
      eventUpdateId: TERMINAL_UPDATE_A,
      eventRejectionStatusCode: null,
      jobState: "completed",
      jobId: attempt.claim.lease.jobId,
      leaseOwner: attempt.claim.lease.leaseOwner,
      generation: String(attempt.claim.lease.leaseGeneration),
      resultEventSequence: "6",
      eventCount: "6",
    });
    expect(snapshot.previousEventHash).toBe(snapshot.executionEventHash);
    expect(
      [
        snapshot.settlementReconciledAt,
        snapshot.eventReconciledAt,
        snapshot.eventRecordedAt,
        snapshot.completedAt,
      ].map((value) => value?.toISOString()),
    ).toEqual(Array(4).fill(result.reconciledAt));
    await expect(
      attempt.purchase.readHumanPurchaseLifecycle(
        attempt.initialized.attemptId,
      ),
    ).resolves.toMatchObject({
      state: "settlement-reconciled",
      latestEventSequence: 6,
      latestEventType: "settlement-reconciled",
    });
  } finally {
    await attempt.purchase.close();
  }
});

it("atomically records an exact rejected settlement", async () => {
  const attempt = await claimTerminalAttempt(context, 572, "terminal-rejected");
  try {
    const result = await attempt.terminal.completeHumanReconciliation(
      rejectedCheckpoint(attempt.claim, 44, 7),
    );
    expect(result).toMatchObject({
      outcome: "created",
      state: "settlement-rejected",
      completion: {
        classification: "REJECTED",
        completionOffset: 44,
        statusCode: 7,
      },
      reconciliationOffset: 42,
      event: { sequence: 6, type: "settlement-rejected" },
      job: { state: "completed", resultEventSequence: 6 },
    });
    await expect(
      attempt.purchase.readHumanPurchaseLifecycle(
        attempt.initialized.attemptId,
      ),
    ).resolves.toMatchObject({
      state: "settlement-rejected",
      latestEventSequence: 6,
      latestEventType: "settlement-rejected",
    });
    const snapshot = await terminalSnapshot(
      context,
      attempt.initialized.attemptId,
    );
    expect(snapshot).toMatchObject({
      attemptState: "settlement-rejected",
      settlementState: "settlement-rejected",
      reconciliationOffset: "42",
      completionOffset: "44",
      updateId: null,
      rejectionStatusCode: 7,
      eventType: "settlement-rejected",
      eventCompletionOffset: "44",
      eventUpdateId: null,
      eventRejectionStatusCode: 7,
      previousEventHash: snapshot.executionEventHash,
      jobId: attempt.claim.lease.jobId,
      leaseOwner: attempt.claim.lease.leaseOwner,
      generation: String(attempt.claim.lease.leaseGeneration),
      resultEventSequence: "6",
      eventCount: "6",
    });
    expect(
      [
        snapshot.settlementReconciledAt,
        snapshot.eventReconciledAt,
        snapshot.eventRecordedAt,
        snapshot.completedAt,
      ].map((value) => value?.toISOString()),
    ).toEqual(Array(4).fill(result.reconciledAt));
  } finally {
    await attempt.purchase.close();
  }
});
