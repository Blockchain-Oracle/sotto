import { afterAll, beforeAll, expect, it } from "vitest";
import { readAuthenticatedHumanSettlementExpectation } from "@sotto/x402-canton";
import { createPurchaseTestRuntime } from "./purchase-postgres.fixtures.js";
import {
  createExecutionStartedAttempt,
  readReconciliationOffset,
  reconciliationRepository,
  type ReconciliationTestContext,
} from "./human-reconciliation.postgres.fixture.js";
import {
  expireReconciliationLease,
  reconciliationDatabaseTime,
  reconciliationJobState,
} from "./human-reconciliation-lease.postgres.fixture.js";

let context: ReconciliationTestContext;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_reconciliation_lease");
});

afterAll(async () => context?.database.drop());

it("gives one SKIP LOCKED winner the exact authenticated settlement scope", async () => {
  const attempt = await createExecutionStartedAttempt(context, 577);
  const second = reconciliationRepository(context);
  try {
    const claims = await Promise.all([
      attempt.purchase.claimHumanReconciliation({
        attemptId: attempt.initialized.attemptId,
        leaseOwner: "reconcile-worker-a",
      }),
      second.claimHumanReconciliation({
        attemptId: attempt.initialized.attemptId,
        leaseOwner: "reconcile-worker-b",
      }),
    ]);
    const winners = claims.filter((claim) => claim !== null);
    expect(winners).toHaveLength(1);
    const winner = winners[0]!;
    expect(winner).toMatchObject({
      lease: {
        attemptId: attempt.initialized.attemptId,
        leaseGeneration: 1,
      },
      scope: {
        beginExclusive: 42,
        commandId: attempt.initialized.commandId,
        executionUserId: attempt.execution.userId,
        reconciliationOffset: 42,
        submissionId: attempt.execution.submissionId,
        expectation: {
          attemptId: attempt.initialized.attemptId,
          commandId: attempt.initialized.commandId,
        },
      },
    });
    expect(Object.isFrozen(winner)).toBe(true);
    expect(
      readAuthenticatedHumanSettlementExpectation(winner.scope.expectation),
    ).toBe(winner.scope.expectation);
    expect(JSON.stringify(winner)).not.toMatch(
      /preparedTransaction|signature|walletResponse/iu,
    );
  } finally {
    await attempt.purchase.close();
    await second.close();
  }
});

it("reclaims an expired generation and rejects the stale worker", async () => {
  const attempt = await createExecutionStartedAttempt(context, 576);
  try {
    const first = await attempt.purchase.claimHumanReconciliation({
      attemptId: attempt.initialized.attemptId,
      leaseMilliseconds: 1_000,
      leaseOwner: "reconcile-expired-a",
    });
    expect(first).not.toBeNull();
    await expireReconciliationLease(context, attempt.initialized.attemptId);
    const current = await attempt.purchase.claimHumanReconciliation({
      attemptId: attempt.initialized.attemptId,
      leaseOwner: "reconcile-expired-b",
    });
    expect(current?.lease.leaseGeneration).toBe(2);
    await expect(
      attempt.purchase.deferHumanReconciliation({
        expectedReconciliationOffset: first!.scope.reconciliationOffset,
        lease: first!.lease,
        scannedThroughOffset: 43,
      }),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
    await expect(
      attempt.purchase.deferHumanReconciliation({
        expectedReconciliationOffset: current!.scope.reconciliationOffset,
        lease: current!.lease,
        scannedThroughOffset: 43,
      }),
    ).resolves.toMatchObject({
      reconciliationOffset: 43,
      job: { leaseGeneration: 2, state: "ready" },
    });
    expect(
      await readReconciliationOffset(context, attempt.initialized.attemptId),
    ).toBe("43");
  } finally {
    await attempt.purchase.close();
  }
});

it("rejects cursor rewind and schedules retry from database time", async () => {
  const attempt = await createExecutionStartedAttempt(context, 575);
  try {
    const claim = await attempt.purchase.claimHumanReconciliation({
      attemptId: attempt.initialized.attemptId,
      leaseOwner: "reconcile-cursor",
    });
    expect(claim).not.toBeNull();
    await expect(
      attempt.purchase.deferHumanReconciliation({
        expectedReconciliationOffset: claim!.scope.reconciliationOffset,
        lease: claim!.lease,
        scannedThroughOffset: 41,
      }),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
    await expect(
      attempt.purchase.deferHumanReconciliation({
        expectedReconciliationOffset: 43,
        lease: claim!.lease,
        scannedThroughOffset: 43,
      }),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
    const before = await reconciliationDatabaseTime(context);
    const deferred = await attempt.purchase.deferHumanReconciliation({
      backoffMilliseconds: 2_000,
      expectedReconciliationOffset: claim!.scope.reconciliationOffset,
      lease: claim!.lease,
      scannedThroughOffset: 42,
    });
    expect(
      Date.parse(deferred.job.availableAt) - Date.parse(before),
    ).toBeGreaterThanOrEqual(2_000);
    expect(
      await reconciliationJobState(context, attempt.initialized.attemptId),
    ).toMatchObject({
      generation: "1",
      owner: null,
      state: "ready",
    });
    await expect(
      attempt.purchase.readHumanPurchaseLifecycle(
        attempt.initialized.attemptId,
      ),
    ).resolves.toMatchObject({ state: "execution-started" });
  } finally {
    await attempt.purchase.close();
  }
});

it("releases a one-connection repository while external work waits", async () => {
  const attempt = await createExecutionStartedAttempt(context, 574);
  await attempt.purchase.close();
  const purchase = reconciliationRepository(context, 1);
  let release!: () => void;
  const external = new Promise<void>((resolve) => (release = resolve));
  try {
    const claim = await purchase.claimHumanReconciliation({
      attemptId: attempt.initialized.attemptId,
      leaseOwner: "reconcile-single-connection",
    });
    expect(claim).not.toBeNull();
    const deferred = external.then(() =>
      purchase.deferHumanReconciliation({
        expectedReconciliationOffset: claim!.scope.reconciliationOffset,
        lease: claim!.lease,
        scannedThroughOffset: claim!.scope.reconciliationOffset,
      }),
    );
    await expect(
      purchase.readHumanPurchaseLifecycle(attempt.initialized.attemptId),
    ).resolves.toMatchObject({ state: "execution-started" });
    release();
    await expect(deferred).resolves.toMatchObject({
      job: { state: "ready" },
    });
  } finally {
    release();
    await purchase.close();
  }
});
