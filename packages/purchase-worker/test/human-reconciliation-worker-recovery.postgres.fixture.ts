import { expect } from "vitest";
import { createHumanReconciliationRepositoryRuntime } from "@sotto/database";
import { projectHumanSettlementExpectation } from "@sotto/x402-canton";
import type { createPurchaseTestRuntime } from "../../database/test/purchase-postgres.fixtures.js";
import { createExecutionStartedAttempt } from "../../database/test/human-reconciliation.postgres.fixture.js";
import {
  expireReconciliationLease,
  reconciliationLeaseSnapshot,
} from "../../database/test/human-reconciliation-lease.postgres.fixture.js";
import { terminalSnapshot } from "../../database/test/human-reconciliation-fence-state.postgres.fixture.js";
import {
  HUMAN_PROVIDER_SETTLEMENT_UPDATE,
  humanProviderSettlementTransaction,
} from "../../x402-canton/test/human-provider-settlement.fixtures.js";
import { createBoundedLocalReconciliationEndpoint } from "./human-reconciliation-http.postgres.fixture.js";
import {
  reconciliationDeferred,
  startReconciliationChild,
  withinReconciliationTest,
} from "./human-reconciliation-process.postgres.fixture.js";

type TestRuntime = Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

export async function runReconciliationProcessRecovery(
  context: TestRuntime,
): Promise<void> {
  const attempt = await createExecutionStartedAttempt(context, 578);
  const expected = projectHumanSettlementExpectation(attempt.prepared);
  await attempt.purchase.close();
  const abandonedStarted = reconciliationDeferred();
  const abandonedRelease = reconciliationDeferred();
  const terminalStarted = reconciliationDeferred();
  const terminalRelease = reconciliationDeferred();
  let calls = 0;
  const transaction = humanProviderSettlementTransaction(expected as never);
  transaction.transaction.offset = 43;
  const endpoint = await createBoundedLocalReconciliationEndpoint(
    async (request) => {
      calls += 1;
      if (calls === 1) {
        abandonedStarted.resolve();
        await abandonedRelease.promise;
        return { outcome: "pending", scannedThroughOffset: 42 };
      }
      if (calls !== 2) throw new Error("unexpected reconciliation read");
      terminalStarted.resolve();
      await terminalRelease.promise;
      return {
        outcome: "succeeded",
        completionOffset: 43,
        submissionId: request.submissionId,
        synchronizerId: request.synchronizerId,
        transaction,
        updateId: HUMAN_PROVIDER_SETTLEMENT_UPDATE,
      };
    },
  );
  const abandoned = startReconciliationChild({
    attemptId: attempt.initialized.attemptId,
    databaseUrl: context.database.databaseUrl,
    endpoint: endpoint.url,
    leaseOwner: "reconcile-abandoned",
    mode: "normal",
  });
  let terminal: ReturnType<typeof startReconciliationChild> | undefined;
  let recovered: ReturnType<typeof startReconciliationChild> | undefined;
  try {
    await withinReconciliationTest(
      abandonedStarted.promise,
      "abandoned child did not start",
    );
    const oldLease = await reconciliationLeaseSnapshot(
      context,
      attempt.initialized.attemptId,
    );
    abandoned.kill();
    await abandoned.closed;
    abandonedRelease.resolve();
    await expireReconciliationLease(context, attempt.initialized.attemptId);

    terminal = startReconciliationChild({
      attemptId: attempt.initialized.attemptId,
      databaseUrl: context.database.databaseUrl,
      endpoint: endpoint.url,
      leaseOwner: "reconcile-terminal",
      mode: "hang-after-terminal",
    });
    await withinReconciliationTest(
      terminalStarted.promise,
      "replacement child did not start",
    );
    const currentLease = await reconciliationLeaseSnapshot(
      context,
      attempt.initialized.attemptId,
    );
    expect(currentLease.leaseGeneration).toBe(oldLease.leaseGeneration + 1);
    const stale = createHumanReconciliationRepositoryRuntime({
      databaseUrl: context.database.databaseUrl,
      maxConnections: 1,
    });
    try {
      await expect(
        stale.repository.deferHumanReconciliation({
          lease: oldLease,
          expectedReconciliationOffset: 42,
          scannedThroughOffset: 42,
        }),
      ).rejects.toThrow();
    } finally {
      await stale.close();
    }

    terminalRelease.resolve();
    await withinReconciliationTest(
      terminal.waitFor("checkpoint-committed"),
      "terminal checkpoint was not committed",
    );
    terminal.kill();
    await terminal.closed;
    recovered = startReconciliationChild({
      attemptId: attempt.initialized.attemptId,
      databaseUrl: context.database.databaseUrl,
      endpoint: endpoint.url,
      leaseOwner: "reconcile-recovered",
      mode: "normal",
    });
    await expect(recovered.result()).resolves.toMatchObject({
      outcome: "idle",
    });
    expect(endpoint.requestCount()).toBe(2);
    await expect(
      terminalSnapshot(context, attempt.initialized.attemptId),
    ).resolves.toMatchObject({
      attemptState: "settlement-reconciled",
      completionOffset: "43",
      eventCount: "6",
      eventType: "settlement-reconciled",
      generation: "2",
      jobState: "completed",
      reconciliationOffset: "42",
      settlementState: "settlement-reconciled",
      updateId: HUMAN_PROVIDER_SETTLEMENT_UPDATE,
    });
  } finally {
    abandonedRelease.resolve();
    terminalRelease.resolve();
    abandoned.kill();
    terminal?.kill();
    recovered?.kill();
    await endpoint.close();
  }
}
