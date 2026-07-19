import type {
  HumanReconciliationCheckpointResult,
  HumanReconciliationDeferResult,
  HumanReconciliationRepository,
} from "@sotto/database";
import { restoreHumanSettlementExpectation } from "@sotto/x402-canton/internal/human-settlement-expectation-journal";
import { vi } from "vitest";
import type { HumanReconciliationReadOnlyAdapter } from "../src/index.js";
import { exportHumanSettlementExpectation } from "../../x402-canton/src/human-settlement-expectation-persistence.js";
import {
  humanProviderSettlementFixture,
  type humanProviderSettlementTransaction,
} from "../../x402-canton/test/human-provider-settlement.fixtures.js";
import { HUMAN_PURCHASE_NOW } from "../../x402-canton/test/human-purchase-commitment.fixtures.js";

const JOB_ID = "018f3f24-7d4a-7e2c-a421-0f3473b94398";

export type ReconciliationWorkerFixture = Awaited<
  ReturnType<typeof reconciliationWorkerFixture>
>;

function terminalResult(
  attemptId: `sha256:${string}`,
  jobId: string,
  completion: Parameters<
    HumanReconciliationRepository["completeHumanReconciliation"]
  >[0]["completion"],
): HumanReconciliationCheckpointResult {
  const recordedAt = new Date().toISOString();
  const state =
    completion.classification === "SUCCEEDED"
      ? "settlement-reconciled"
      : "settlement-rejected";
  return Object.freeze({
    outcome: "created" as const,
    attemptId,
    state,
    completion,
    reconciliationOffset: 41,
    reconciledAt: recordedAt,
    event: Object.freeze({
      sequence: 6 as const,
      type: state,
      eventHash: `sha256:${"d".repeat(64)}` as const,
      previousEventHash: `sha256:${"e".repeat(64)}` as const,
      recordedAt,
    }),
    job: Object.freeze({
      jobId,
      state: "completed" as const,
      leaseGeneration: 1,
      resultEventSequence: 6 as const,
      completedAt: recordedAt,
    }),
  });
}

export async function reconciliationWorkerFixture() {
  const previousNow = Date.now();
  const alreadyFake = vi.isFakeTimers();
  if (alreadyFake) vi.setSystemTime(new Date(HUMAN_PURCHASE_NOW));
  else vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  let settlement: Awaited<ReturnType<typeof humanProviderSettlementFixture>>;
  try {
    settlement = await humanProviderSettlementFixture();
  } finally {
    if (alreadyFake) vi.setSystemTime(previousNow);
    else vi.useRealTimers();
  }
  const expected = restoreHumanSettlementExpectation(
    exportHumanSettlementExpectation(settlement.expected),
  );
  const lease = Object.freeze({
    jobId: JOB_ID,
    attemptId: expected.attemptId,
    leaseGeneration: 1,
    leaseOwner: "human-reconciliation-worker",
    claimedAt: new Date().toISOString(),
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const scope = Object.freeze({
    attemptId: expected.attemptId,
    beginExclusive: 40,
    commandId: expected.commandId,
    executionUserId: "sotto-human-executor",
    reconciliationOffset: 41,
    submissionId: "018f3f24-7d4a-7e2c-a421-0f3473b94399",
    expectation: expected,
  });
  const deferHumanReconciliation = vi.fn(
    async ({ scannedThroughOffset }): Promise<HumanReconciliationDeferResult> =>
      Object.freeze({
        outcome: "requeued" as const,
        attemptId: scope.attemptId,
        reconciliationOffset: scannedThroughOffset,
        job: Object.freeze({
          jobId: JOB_ID,
          state: "ready" as const,
          leaseGeneration: 1,
          availableAt: new Date(Date.now() + 1_000).toISOString(),
        }),
      }),
  );
  const completeHumanReconciliation = vi.fn(
    async ({ completion }): Promise<HumanReconciliationCheckpointResult> =>
      terminalResult(scope.attemptId, JOB_ID, completion),
  );
  const claimHumanReconciliation = vi.fn<
    HumanReconciliationRepository["claimHumanReconciliation"]
  >(async () => Object.freeze({ lease, scope }));
  const repository = Object.freeze({
    claimHumanReconciliation,
    deferHumanReconciliation,
    completeHumanReconciliation,
  }) satisfies HumanReconciliationRepository;
  const readReconciliation = vi.fn<HumanReconciliationReadOnlyAdapter>(
    async () => ({
      outcome: "succeeded",
      completionOffset: 42,
      updateId: settlement.proof.updateId,
      submissionId: scope.submissionId,
      synchronizerId: expected.synchronizerId,
      transaction: settlement.response,
    }),
  );
  return {
    ...settlement,
    expected,
    lease,
    scope,
    repository,
    readReconciliation,
    completeHumanReconciliation,
    deferHumanReconciliation,
  };
}

export function settlementAtOffset(
  response: ReturnType<typeof humanProviderSettlementTransaction>,
  offset: number,
) {
  const candidate = structuredClone(response);
  candidate.transaction.offset = offset;
  return candidate;
}
