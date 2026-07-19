import { expect, expectTypeOf, it, vi } from "vitest";
import {
  createHumanReconciliationWorker,
  type HumanReconciliationWorkerDependencies,
} from "../src/index.js";
import {
  reconciliationWorkerFixture,
  settlementAtOffset,
} from "./human-reconciliation-worker.fixtures.js";

const SUBMISSION_ID = "018f3f24-7d4a-7e2c-a421-0f3473b94399";
const SYNCHRONIZER_ID = `global-domain::1220${"b".repeat(64)}`;

it("exposes only a narrow repository and one read-only probe", async () => {
  expectTypeOf<keyof HumanReconciliationWorkerDependencies>().toEqualTypeOf<
    "repository" | "readReconciliation"
  >();
  const context = await reconciliationWorkerFixture();
  expect(() =>
    createHumanReconciliationWorker({
      repository: context.repository,
      readReconciliation: context.readReconciliation,
      wallet: vi.fn(),
    } as never),
  ).toThrow(/dependencies|repository/iu);
  expect(() =>
    createHumanReconciliationWorker({
      repository: { ...context.repository, execute: vi.fn() },
      readReconciliation: context.readReconciliation,
    } as never),
  ).toThrow(/dependencies|repository/iu);
});

it("accepts a pending scan that intentionally stays at the current cursor", async () => {
  const context = await reconciliationWorkerFixture();
  context.readReconciliation.mockResolvedValueOnce({
    outcome: "pending",
    scannedThroughOffset: context.scope.reconciliationOffset,
  });
  const worker = createHumanReconciliationWorker({
    repository: context.repository,
    readReconciliation: context.readReconciliation,
  });

  await expect(
    worker.runOne({ leaseOwner: context.lease.leaseOwner }),
  ).resolves.toMatchObject({
    outcome: "pending",
    checkpoint: {
      reconciliationOffset: context.scope.reconciliationOffset,
    },
  });
});

it.each([
  ["null", null],
  ["array", []],
  ["unknown outcome", { outcome: "SUCCEEDED" }],
  [
    "pending extra key",
    { outcome: "pending", scannedThroughOffset: 41, proof: {} },
  ],
  ["cursor regression", { outcome: "pending", scannedThroughOffset: 40 }],
  ["fractional cursor", { outcome: "pending", scannedThroughOffset: 41.5 }],
  [
    "zero rejection",
    {
      outcome: "rejected",
      completionOffset: 42,
      statusCode: 0,
      submissionId: SUBMISSION_ID,
      synchronizerId: SYNCHRONIZER_ID,
    },
  ],
  [
    "large rejection",
    {
      outcome: "rejected",
      completionOffset: 42,
      statusCode: 17,
      submissionId: SUBMISSION_ID,
      synchronizerId: SYNCHRONIZER_ID,
    },
  ],
  [
    "same terminal offset",
    {
      outcome: "rejected",
      completionOffset: 41,
      statusCode: 7,
      submissionId: SUBMISSION_ID,
      synchronizerId: SYNCHRONIZER_ID,
    },
  ],
  [
    "success extra proof",
    {
      outcome: "succeeded",
      completionOffset: 42,
      updateId: `1220${"c".repeat(64)}`,
      submissionId: SUBMISSION_ID,
      synchronizerId: SYNCHRONIZER_ID,
      transaction: {},
      proof: {},
    },
  ],
  [
    "unsafe success offset",
    {
      outcome: "succeeded",
      completionOffset: Number.MAX_SAFE_INTEGER + 1,
      updateId: `1220${"c".repeat(64)}`,
      submissionId: SUBMISSION_ID,
      synchronizerId: SYNCHRONIZER_ID,
      transaction: {},
    },
  ],
] as const)("rejects malformed probe result: %s", async (_label, candidate) => {
  const context = await reconciliationWorkerFixture();
  context.readReconciliation.mockResolvedValueOnce(candidate as never);
  const worker = createHumanReconciliationWorker({
    repository: context.repository,
    readReconciliation: context.readReconciliation,
  });

  await expect(
    worker.runOne({ leaseOwner: context.lease.leaseOwner }),
  ).rejects.toMatchObject({ code: "HUMAN_RECONCILIATION_FAILED" });
  expect(context.deferHumanReconciliation).not.toHaveBeenCalled();
  expect(context.completeHumanReconciliation).not.toHaveBeenCalled();
});

it.each([41, 43])(
  "rejects provider transaction offset %i against completion offset 42",
  async (transactionOffset) => {
    const context = await reconciliationWorkerFixture();
    context.readReconciliation.mockResolvedValueOnce({
      outcome: "succeeded",
      completionOffset: 42,
      updateId: context.proof.updateId,
      submissionId: context.scope.submissionId,
      synchronizerId: context.expected.synchronizerId,
      transaction: settlementAtOffset(context.response, transactionOffset),
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

it("constructs settlement proof internally and rejects an update substitution", async () => {
  const context = await reconciliationWorkerFixture();
  context.readReconciliation.mockResolvedValueOnce({
    outcome: "succeeded",
    completionOffset: 42,
    updateId: `1220${"a".repeat(64)}`,
    submissionId: context.scope.submissionId,
    synchronizerId: context.expected.synchronizerId,
    transaction: context.response,
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

it("rejects a forged stored expectation before the external probe", async () => {
  const context = await reconciliationWorkerFixture();
  context.repository.claimHumanReconciliation.mockResolvedValueOnce({
    lease: context.lease,
    scope: { ...context.scope, expectation: { ...context.expected } },
  } as never);
  const worker = createHumanReconciliationWorker({
    repository: context.repository,
    readReconciliation: context.readReconciliation,
  });

  await expect(
    worker.runOne({ leaseOwner: context.lease.leaseOwner }),
  ).rejects.toMatchObject({ code: "HUMAN_RECONCILIATION_FAILED" });
  expect(context.readReconciliation).not.toHaveBeenCalled();
  expect(context.completeHumanReconciliation).not.toHaveBeenCalled();
});
