import { createHash } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createPurchaseTestRuntime } from "./purchase-postgres.fixtures.js";
import {
  claimTerminalAttempt,
  rejectedCheckpoint,
  succeededCheckpoint,
} from "./human-reconciliation-fence.postgres.fixture.js";
import { terminalSnapshot } from "./human-reconciliation-fence-state.postgres.fixture.js";
import type { ReconciliationTestContext } from "./human-reconciliation.postgres.fixture.js";

let context: ReconciliationTestContext;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_reconciliation_cursor");
});

afterAll(async () => context?.database.drop());

it("retains an advanced scan cursor separately from completion", async () => {
  const attempt = await claimTerminalAttempt(context, 562, "cursor-first");
  try {
    await attempt.purchase.deferHumanReconciliation({
      lease: attempt.claim.lease,
      expectedReconciliationOffset: 42,
      scannedThroughOffset: 44,
      backoffMilliseconds: 1_000,
    });
    await new Promise((resolve) => setTimeout(resolve, 1_050));
    const current = await attempt.purchase.claimHumanReconciliation({
      attemptId: attempt.initialized.attemptId,
      leaseOwner: "cursor-current",
    });
    expect(current?.scope.reconciliationOffset).toBe(44);
    const result = await attempt.terminal.completeHumanReconciliation(
      succeededCheckpoint(current!, 47),
    );
    expect(result).toMatchObject({
      reconciliationOffset: 44,
      completion: { completionOffset: 47 },
    });
    expect(
      await terminalSnapshot(context, attempt.initialized.attemptId),
    ).toMatchObject({ reconciliationOffset: "44", completionOffset: "47" });
    await expect(
      attempt.terminal.completeHumanReconciliation({
        ...succeededCheckpoint(current!, 47),
        expectedReconciliationOffset: 43,
      }),
    ).rejects.toMatchObject({ code: "PURCHASE_CONFLICT" });
  } finally {
    await attempt.purchase.close();
  }
});

it("accepts the canonical zero cursor and completion one", async () => {
  const attempt = await claimTerminalAttempt(
    context,
    561,
    "cursor-zero",
    60_000,
    0,
  );
  try {
    expect(attempt.claim.scope.reconciliationOffset).toBe(0);
    await expect(
      attempt.terminal.completeHumanReconciliation(
        succeededCheckpoint(attempt.claim, 1),
      ),
    ).resolves.toMatchObject({
      reconciliationOffset: 0,
      completion: { completionOffset: 1 },
    });
  } finally {
    await attempt.purchase.close();
  }
});

it("pins the independent rejected-settlement hash vector", async () => {
  const attempt = await claimTerminalAttempt(context, 560, "rejection-hash");
  try {
    const result = await attempt.terminal.completeHumanReconciliation(
      rejectedCheckpoint(attempt.claim, 48, 9),
    );
    const snapshot = await terminalSnapshot(
      context,
      attempt.initialized.attemptId,
    );
    const preimage = [
      "sotto-human-settlement-rejected-event-v1",
      attempt.initialized.attemptId,
      snapshot.commandId,
      snapshot.submissionId,
      snapshot.executionUserId,
      snapshot.expectationDigest,
      "42",
      "48",
      "9",
      result.reconciledAt,
      snapshot.executionEventHash,
    ].join("\0");
    expect(result.event.eventHash).toBe(
      `sha256:${createHash("sha256").update(preimage).digest("hex")}`,
    );
    expect(snapshot).toMatchObject({
      eventType: "settlement-rejected",
      eventCompletionOffset: "48",
      eventUpdateId: null,
      eventRejectionStatusCode: 9,
      previousEventHash: snapshot.executionEventHash,
    });
  } finally {
    await attempt.purchase.close();
  }
});
