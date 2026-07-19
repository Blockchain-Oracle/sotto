import { afterEach, expect, it, vi } from "vitest";
import { createHumanReconciliationWorker } from "../src/index.js";
import { reconciliationWorkerFixture } from "./human-reconciliation-worker.fixtures.js";

afterEach(() => vi.useRealTimers());

it("rejects caller cancellation before claiming PostgreSQL work", async () => {
  const context = await reconciliationWorkerFixture();
  const controller = new AbortController();
  controller.abort("private caller reason");
  const worker = createHumanReconciliationWorker({
    repository: context.repository,
    readReconciliation: context.readReconciliation,
  });

  await expect(
    worker.runOne({
      leaseOwner: context.lease.leaseOwner,
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ code: "HUMAN_RECONCILIATION_CANCELLED" });
  expect(context.repository.claimHumanReconciliation).not.toHaveBeenCalled();
});

it("cancels a hung adapter promptly and writes no checkpoint", async () => {
  const context = await reconciliationWorkerFixture();
  const controller = new AbortController();
  let started!: () => void;
  const adapterStarted = new Promise<void>((resolve) => (started = resolve));
  context.readReconciliation.mockImplementationOnce(async () => {
    started();
    return new Promise<never>(() => undefined);
  });
  const worker = createHumanReconciliationWorker({
    repository: context.repository,
    readReconciliation: context.readReconciliation,
  });
  const run = worker.runOne({
    leaseOwner: context.lease.leaseOwner,
    signal: controller.signal,
  });

  await adapterStarted;
  controller.abort("private caller reason");

  await expect(run).rejects.toMatchObject({
    code: "HUMAN_RECONCILIATION_CANCELLED",
    message: "human reconciliation worker cancelled",
  });
  expect(context.deferHumanReconciliation).not.toHaveBeenCalled();
  expect(context.completeHumanReconciliation).not.toHaveBeenCalled();
});

it("rejects an already expired lease before the adapter", async () => {
  const context = await reconciliationWorkerFixture();
  context.repository.claimHumanReconciliation.mockResolvedValueOnce({
    lease: {
      ...context.lease,
      claimedAt: new Date(Date.now() - 61_000).toISOString(),
      leaseExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    },
    scope: context.scope,
  });
  const worker = createHumanReconciliationWorker({
    repository: context.repository,
    readReconciliation: context.readReconciliation,
  });

  await expect(
    worker.runOne({ leaseOwner: context.lease.leaseOwner }),
  ).rejects.toMatchObject({ code: "HUMAN_RECONCILIATION_LEASE_EXPIRED" });
  expect(context.readReconciliation).not.toHaveBeenCalled();
});

it("expires a hung adapter before the database lease can lapse", async () => {
  vi.useFakeTimers({ now: new Date("2026-07-18T16:00:00.000Z") });
  const context = await reconciliationWorkerFixture();
  context.repository.claimHumanReconciliation.mockResolvedValueOnce({
    lease: {
      ...context.lease,
      claimedAt: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + 6_000).toISOString(),
    },
    scope: context.scope,
  });
  context.readReconciliation.mockImplementationOnce(
    async () => new Promise<never>(() => undefined),
  );
  const worker = createHumanReconciliationWorker({
    repository: context.repository,
    readReconciliation: context.readReconciliation,
  });
  const run = worker.runOne({ leaseOwner: context.lease.leaseOwner });
  const rejected = expect(run).rejects.toMatchObject({
    code: "HUMAN_RECONCILIATION_LEASE_EXPIRED",
  });

  await vi.advanceTimersByTimeAsync(1_001);

  await rejected;
  expect(context.deferHumanReconciliation).not.toHaveBeenCalled();
  expect(context.completeHumanReconciliation).not.toHaveBeenCalled();
});

it.each([
  [
    "synchronous",
    () => {
      throw new Error("private adapter detail");
    },
  ],
  [
    "asynchronous",
    async () => {
      throw new Error("private adapter detail");
    },
  ],
] as const)("redacts a %s adapter failure", async (_label, failure) => {
  const context = await reconciliationWorkerFixture();
  context.readReconciliation.mockImplementationOnce(failure as never);
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
  expect(context.deferHumanReconciliation).not.toHaveBeenCalled();
  expect(context.completeHumanReconciliation).not.toHaveBeenCalled();
});

it("returns committed success when cancellation races the checkpoint", async () => {
  const context = await reconciliationWorkerFixture();
  const controller = new AbortController();
  const implementation =
    context.completeHumanReconciliation.getMockImplementation()!;
  let started!: () => void;
  let release!: () => void;
  const checkpointStarted = new Promise<void>((resolve) => (started = resolve));
  const checkpointReleased = new Promise<void>(
    (resolve) => (release = resolve),
  );
  context.completeHumanReconciliation.mockImplementationOnce(async (input) => {
    started();
    await checkpointReleased;
    return implementation(input);
  });
  const worker = createHumanReconciliationWorker({
    repository: context.repository,
    readReconciliation: context.readReconciliation,
  });
  const run = worker.runOne({
    leaseOwner: context.lease.leaseOwner,
    signal: controller.signal,
  });

  await checkpointStarted;
  controller.abort("private caller reason");
  release();

  await expect(run).resolves.toMatchObject({
    outcome: "settlement-reconciled",
  });
});
