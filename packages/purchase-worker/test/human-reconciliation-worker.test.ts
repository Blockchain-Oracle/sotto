import { describe, expect, it } from "vitest";
import { createHumanReconciliationWorker } from "../src/index.js";
import { reconciliationWorkerFixture } from "./human-reconciliation-worker.fixtures.js";

describe("one-shot human reconciliation worker", () => {
  it("does no external work when the PostgreSQL queue is idle", async () => {
    const context = await reconciliationWorkerFixture();
    context.repository.claimHumanReconciliation.mockResolvedValueOnce(null);
    const worker = createHumanReconciliationWorker({
      repository: context.repository,
      readReconciliation: context.readReconciliation,
    });

    await expect(
      worker.runOne({ leaseOwner: "idle-reconciler" }),
    ).resolves.toEqual({ outcome: "idle" });
    expect(context.readReconciliation).not.toHaveBeenCalled();
    expect(context.deferHumanReconciliation).not.toHaveBeenCalled();
    expect(context.completeHumanReconciliation).not.toHaveBeenCalled();
  });

  it("requeues an absent completion at its monotonic scan offset", async () => {
    const context = await reconciliationWorkerFixture();
    context.readReconciliation.mockResolvedValueOnce({
      outcome: "pending",
      scannedThroughOffset: 45,
    });
    const worker = createHumanReconciliationWorker({
      repository: context.repository,
      readReconciliation: context.readReconciliation,
    });

    await expect(
      worker.runOne({ leaseOwner: context.lease.leaseOwner }),
    ).resolves.toMatchObject({
      outcome: "pending",
      checkpoint: { outcome: "requeued", reconciliationOffset: 45 },
    });
    expect(context.readReconciliation).toHaveBeenCalledWith(
      {
        beginExclusive: context.scope.reconciliationOffset,
        commandId: context.scope.commandId,
        payerParty: context.expected.payerParty,
        providerParty: context.expected.providerParty,
        submissionId: context.scope.submissionId,
        synchronizerId: context.expected.synchronizerId,
        userId: context.scope.executionUserId,
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(context.deferHumanReconciliation).toHaveBeenCalledWith({
      lease: context.lease,
      expectedReconciliationOffset: context.scope.reconciliationOffset,
      scannedThroughOffset: 45,
    });
    expect(context.completeHumanReconciliation).not.toHaveBeenCalled();
  });

  it("persists an exact command rejection without reading settlement", async () => {
    const context = await reconciliationWorkerFixture();
    context.readReconciliation.mockResolvedValueOnce({
      outcome: "rejected",
      completionOffset: 42,
      statusCode: 7,
      submissionId: context.scope.submissionId,
      synchronizerId: context.expected.synchronizerId,
    });
    const worker = createHumanReconciliationWorker({
      repository: context.repository,
      readReconciliation: context.readReconciliation,
    });

    await expect(
      worker.runOne({ leaseOwner: context.lease.leaseOwner }),
    ).resolves.toMatchObject({
      outcome: "settlement-rejected",
      checkpoint: {
        state: "settlement-rejected",
        completion: {
          classification: "REJECTED",
          completionOffset: 42,
          statusCode: 7,
        },
      },
    });
    expect(context.completeHumanReconciliation).toHaveBeenCalledWith({
      lease: context.lease,
      expectedReconciliationOffset: context.scope.reconciliationOffset,
      completion: {
        classification: "REJECTED",
        completionOffset: 42,
        statusCode: 7,
      },
    });
  });

  it("terminalizes success only after exact provider settlement verification", async () => {
    const context = await reconciliationWorkerFixture();
    const worker = createHumanReconciliationWorker({
      repository: context.repository,
      readReconciliation: context.readReconciliation,
    });

    await expect(
      worker.runOne({ leaseOwner: context.lease.leaseOwner }),
    ).resolves.toMatchObject({
      outcome: "settlement-reconciled",
      checkpoint: {
        state: "settlement-reconciled",
        completion: {
          classification: "SUCCEEDED",
          completionOffset: 42,
          updateId: context.proof.updateId,
        },
      },
    });
    expect(context.completeHumanReconciliation).toHaveBeenCalledWith({
      lease: context.lease,
      expectedReconciliationOffset: context.scope.reconciliationOffset,
      completion: {
        classification: "SUCCEEDED",
        completionOffset: 42,
        updateId: context.proof.updateId,
      },
    });
    expect(
      JSON.stringify(context.completeHumanReconciliation.mock.calls),
    ).not.toContain("CreatedEvent");
  });

  it("a replacement worker is idle after one terminal checkpoint", async () => {
    const context = await reconciliationWorkerFixture();
    context.repository.claimHumanReconciliation
      .mockResolvedValueOnce({ lease: context.lease, scope: context.scope })
      .mockResolvedValueOnce(null);
    const worker = createHumanReconciliationWorker({
      repository: context.repository,
      readReconciliation: context.readReconciliation,
    });

    await expect(
      worker.runOne({ leaseOwner: context.lease.leaseOwner }),
    ).resolves.toMatchObject({ outcome: "settlement-reconciled" });
    const restarted = createHumanReconciliationWorker({
      repository: context.repository,
      readReconciliation: context.readReconciliation,
    });
    await expect(
      restarted.runOne({ leaseOwner: "replacement-reconciler" }),
    ).resolves.toEqual({ outcome: "idle" });
    expect(context.readReconciliation).toHaveBeenCalledOnce();
    expect(context.completeHumanReconciliation).toHaveBeenCalledOnce();
  });

  it("returns a durable replay when the first checkpoint response was lost", async () => {
    const context = await reconciliationWorkerFixture();
    const implementation =
      context.completeHumanReconciliation.getMockImplementation()!;
    context.completeHumanReconciliation.mockImplementationOnce(
      async (input) => ({
        ...(await implementation(input)),
        outcome: "replayed",
      }),
    );
    const worker = createHumanReconciliationWorker({
      repository: context.repository,
      readReconciliation: context.readReconciliation,
    });

    await expect(
      worker.runOne({ leaseOwner: context.lease.leaseOwner }),
    ).resolves.toMatchObject({
      outcome: "settlement-reconciled",
      checkpoint: { outcome: "replayed" },
    });
  });
});
