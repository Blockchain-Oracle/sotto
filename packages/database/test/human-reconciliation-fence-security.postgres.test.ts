import { createHash } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createPurchaseTestRuntime } from "./purchase-postgres.fixtures.js";
import { expireReconciliationLease } from "./human-reconciliation-lease.postgres.fixture.js";
import {
  claimTerminalAttempt,
  succeededCheckpoint,
  TERMINAL_UPDATE_B,
} from "./human-reconciliation-fence.postgres.fixture.js";
import type { ReconciliationTestContext } from "./human-reconciliation.postgres.fixture.js";
import {
  terminalFault,
  terminalSnapshot,
} from "./human-reconciliation-fence-state.postgres.fixture.js";

let context: ReconciliationTestContext;

beforeAll(async () => {
  context = await createPurchaseTestRuntime(
    "sotto_reconciliation_fence_security",
  );
});

afterAll(async () => context?.database.drop());

it("conflicts on a changed result but exactly replays the original", async () => {
  const attempt = await claimTerminalAttempt(context, 569, "terminal-conflict");
  const original = succeededCheckpoint(attempt.claim, 43);
  try {
    const created =
      await attempt.terminal.completeHumanReconciliation(original);
    const before = await terminalSnapshot(
      context,
      attempt.initialized.attemptId,
    );
    await expect(
      attempt.terminal.completeHumanReconciliation({
        ...original,
        completion: {
          classification: "SUCCEEDED",
          completionOffset: 44,
          updateId: TERMINAL_UPDATE_B,
        },
      }),
    ).rejects.toMatchObject({ code: "PURCHASE_CONFLICT" });
    await expect(
      attempt.terminal.completeHumanReconciliation({
        ...original,
        expectedReconciliationOffset: original.expectedReconciliationOffset - 1,
      }),
    ).rejects.toMatchObject({ code: "PURCHASE_CONFLICT" });
    await expect(
      attempt.terminal.completeHumanReconciliation(original),
    ).resolves.toEqual({ ...created, outcome: "replayed" });
    expect(
      await terminalSnapshot(context, attempt.initialized.attemptId),
    ).toEqual(before);
  } finally {
    await attempt.purchase.close();
  }
});

it("rolls back event and terminal rows when the final job update fails", async () => {
  const attempt = await claimTerminalAttempt(context, 568, "terminal-rollback");
  const before = await terminalSnapshot(context, attempt.initialized.attemptId);
  let cleanup: (() => Promise<void>) | undefined;
  try {
    cleanup = await terminalFault(context);
    await expect(
      attempt.terminal.completeHumanReconciliation(
        succeededCheckpoint(attempt.claim, 44),
      ),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
    expect(
      await terminalSnapshot(context, attempt.initialized.attemptId),
    ).toEqual(before);
    await cleanup();
    cleanup = undefined;
    await expect(
      attempt.terminal.completeHumanReconciliation(
        succeededCheckpoint(attempt.claim, 44),
      ),
    ).resolves.toMatchObject({ outcome: "created" });
  } finally {
    await cleanup?.();
    await attempt.purchase.close();
  }
});

it("rejects a stale generation without consuming the current lease", async () => {
  const attempt = await claimTerminalAttempt(context, 567, "terminal-stale-a");
  try {
    await expireReconciliationLease(context, attempt.initialized.attemptId);
    const current = await attempt.purchase.claimHumanReconciliation({
      attemptId: attempt.initialized.attemptId,
      leaseOwner: "terminal-stale-b",
    });
    expect(current?.lease.leaseGeneration).toBe(2);
    const before = await terminalSnapshot(
      context,
      attempt.initialized.attemptId,
    );
    await expect(
      attempt.terminal.completeHumanReconciliation(
        succeededCheckpoint(attempt.claim),
      ),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
    expect(
      await terminalSnapshot(context, attempt.initialized.attemptId),
    ).toEqual(before);
    await expect(
      attempt.terminal.completeHumanReconciliation(
        succeededCheckpoint(current!, 45),
      ),
    ).resolves.toMatchObject({ outcome: "created" });
  } finally {
    await attempt.purchase.close();
  }
});

it("pins the literal event hash and preserves append-only evidence", async () => {
  const attempt = await claimTerminalAttempt(context, 566, "terminal-hash");
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    await expect(
      attempt.terminal.completeHumanReconciliation(
        succeededCheckpoint(
          attempt.claim,
          attempt.claim.scope.reconciliationOffset,
        ),
      ),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
    const result = await attempt.terminal.completeHumanReconciliation(
      succeededCheckpoint(attempt.claim, 47),
    );
    const snapshot = await terminalSnapshot(
      context,
      attempt.initialized.attemptId,
    );
    const preimage = [
      "sotto-human-settlement-reconciled-event-v1",
      attempt.initialized.attemptId,
      snapshot.commandId,
      snapshot.submissionId,
      snapshot.executionUserId,
      snapshot.expectationDigest,
      "42",
      "47",
      result.completion.classification === "SUCCEEDED"
        ? result.completion.updateId
        : "",
      result.reconciledAt,
      result.event.previousEventHash,
    ].join("\0");
    expect(result.event.eventHash).toBe(
      `sha256:${createHash("sha256").update(preimage).digest("hex")}`,
    );
    await expect(
      client.query(
        `UPDATE sotto.attempt_events SET event_hash = $2
         WHERE attempt_id = $1 AND sequence = 6`,
        [attempt.initialized.attemptId, `sha256:${"f".repeat(64)}`],
      ),
    ).rejects.toMatchObject({ code: "55000" });
    expect(
      await terminalSnapshot(context, attempt.initialized.attemptId),
    ).toEqual(snapshot);
    await expect(
      attempt.purchase.readHumanPurchaseLifecycle(
        attempt.initialized.attemptId,
      ),
    ).resolves.toMatchObject({
      state: "settlement-reconciled",
      latestEventSequence: 6,
    });
    await expect(
      client.query(
        `DELETE FROM sotto.attempt_events
         WHERE attempt_id = $1 AND sequence = 6`,
        [attempt.initialized.attemptId],
      ),
    ).rejects.toMatchObject({ code: "55000" });
  } finally {
    await client.end();
    await attempt.purchase.close();
  }
});
