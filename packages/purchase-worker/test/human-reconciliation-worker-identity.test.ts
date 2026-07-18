import { expect, it } from "vitest";
import {
  createHumanReconciliationWorker,
  HumanReconciliationWorkerError,
} from "../src/index.js";
import { reconciliationWorkerFixture } from "./human-reconciliation-worker.fixtures.js";

it.each([
  ["missing", undefined],
  ["substituted", "018f3f24-7d4a-7e2c-a421-0f3473b94300"],
] as const)(
  "rejects a terminal probe with %s submission identity",
  async (_label, submissionId) => {
    const context = await reconciliationWorkerFixture();
    context.readReconciliation.mockResolvedValueOnce({
      outcome: "succeeded",
      completionOffset: 42,
      updateId: context.proof.updateId,
      synchronizerId: context.expected.synchronizerId,
      transaction: context.response,
      ...(submissionId === undefined ? {} : { submissionId }),
    });
    const worker = createHumanReconciliationWorker({
      repository: context.repository,
      readReconciliation: context.readReconciliation,
    });

    await expect(
      worker.runOne({ leaseOwner: context.lease.leaseOwner }),
    ).rejects.toMatchObject({ code: "HUMAN_RECONCILIATION_FAILED" });
    expect(context.completeHumanReconciliation).not.toHaveBeenCalled();
  },
);

it("rejects a terminal probe from another synchronizer", async () => {
  const context = await reconciliationWorkerFixture();
  context.readReconciliation.mockResolvedValueOnce({
    outcome: "rejected",
    completionOffset: 42,
    statusCode: 7,
    submissionId: context.scope.submissionId,
    synchronizerId: `other-domain::1220${"d".repeat(64)}`,
  });
  const worker = createHumanReconciliationWorker({
    repository: context.repository,
    readReconciliation: context.readReconciliation,
  });

  await expect(
    worker.runOne({ leaseOwner: context.lease.leaseOwner }),
  ).rejects.toMatchObject({ code: "HUMAN_RECONCILIATION_FAILED" });
  expect(context.completeHumanReconciliation).not.toHaveBeenCalled();
});

it("normalizes an adapter-spoofed public worker error", async () => {
  const context = await reconciliationWorkerFixture();
  context.readReconciliation.mockRejectedValueOnce(
    new HumanReconciliationWorkerError("HUMAN_RECONCILIATION_CANCELLED"),
  );
  const worker = createHumanReconciliationWorker({
    repository: context.repository,
    readReconciliation: context.readReconciliation,
  });

  await expect(
    worker.runOne({ leaseOwner: context.lease.leaseOwner }),
  ).rejects.toMatchObject({
    code: "HUMAN_RECONCILIATION_FAILED",
    message: "human reconciliation worker failed",
  });
});

it("normalizes an adapter-forged worker error prototype", async () => {
  const context = await reconciliationWorkerFixture();
  const forged = Object.create(
    HumanReconciliationWorkerError.prototype,
  ) as HumanReconciliationWorkerError;
  Object.defineProperties(forged, {
    code: { value: "HUMAN_RECONCILIATION_LEASE_EXPIRED" },
    message: { value: "human reconciliation worker lease window exhausted" },
    name: { value: "HumanReconciliationWorkerError" },
  });
  context.readReconciliation.mockRejectedValueOnce(forged);
  const worker = createHumanReconciliationWorker({
    repository: context.repository,
    readReconciliation: context.readReconciliation,
  });

  await expect(
    worker.runOne({ leaseOwner: context.lease.leaseOwner }),
  ).rejects.toMatchObject({
    code: "HUMAN_RECONCILIATION_FAILED",
    message: "human reconciliation worker failed",
  });
});
