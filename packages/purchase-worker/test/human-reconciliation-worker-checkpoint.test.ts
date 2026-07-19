import { expect, it } from "vitest";
import { createHumanReconciliationWorker } from "../src/index.js";
import { reconciliationWorkerFixture } from "./human-reconciliation-worker.fixtures.js";

it("never reports a pending cursor that PostgreSQL did not persist", async () => {
  const context = await reconciliationWorkerFixture();
  const implementation =
    context.deferHumanReconciliation.getMockImplementation()!;
  context.readReconciliation.mockResolvedValueOnce({
    outcome: "pending",
    scannedThroughOffset: 45,
  });
  context.deferHumanReconciliation.mockImplementationOnce(async (input) => ({
    ...(await implementation(input)),
    reconciliationOffset: 44,
  }));
  const worker = createHumanReconciliationWorker({
    repository: context.repository,
    readReconciliation: context.readReconciliation,
  });

  await expect(
    worker.runOne({ leaseOwner: context.lease.leaseOwner }),
  ).rejects.toMatchObject({ code: "HUMAN_RECONCILIATION_FAILED" });
});

it("never reports settlement when the terminal checkpoint disagrees", async () => {
  const context = await reconciliationWorkerFixture();
  const implementation =
    context.completeHumanReconciliation.getMockImplementation()!;
  context.completeHumanReconciliation.mockImplementationOnce(async (input) => ({
    ...(await implementation(input)),
    state: "settlement-rejected",
  }));
  const worker = createHumanReconciliationWorker({
    repository: context.repository,
    readReconciliation: context.readReconciliation,
  });

  await expect(
    worker.runOne({ leaseOwner: context.lease.leaseOwner }),
  ).rejects.toMatchObject({ code: "HUMAN_RECONCILIATION_FAILED" });
});

it("rejects a pending checkpoint enriched with raw transaction data", async () => {
  const context = await reconciliationWorkerFixture();
  const implementation =
    context.deferHumanReconciliation.getMockImplementation()!;
  context.readReconciliation.mockResolvedValueOnce({
    outcome: "pending",
    scannedThroughOffset: 45,
  });
  context.deferHumanReconciliation.mockImplementationOnce(async (input) => {
    const checkpoint = await implementation(input);
    return {
      ...checkpoint,
      job: { ...checkpoint.job, transaction: context.response },
    } as never;
  });
  const worker = createHumanReconciliationWorker({
    repository: context.repository,
    readReconciliation: context.readReconciliation,
  });

  await expect(
    worker.runOne({ leaseOwner: context.lease.leaseOwner }),
  ).rejects.toMatchObject({ code: "HUMAN_RECONCILIATION_FAILED" });
});

it("rejects a terminal checkpoint enriched with raw proof data", async () => {
  const context = await reconciliationWorkerFixture();
  const implementation =
    context.completeHumanReconciliation.getMockImplementation()!;
  context.completeHumanReconciliation.mockImplementationOnce(
    async (input) =>
      ({
        ...(await implementation(input)),
        proof: context.proof,
      }) as never,
  );
  const worker = createHumanReconciliationWorker({
    repository: context.repository,
    readReconciliation: context.readReconciliation,
  });

  await expect(
    worker.runOne({ leaseOwner: context.lease.leaseOwner }),
  ).rejects.toMatchObject({ code: "HUMAN_RECONCILIATION_FAILED" });
});
