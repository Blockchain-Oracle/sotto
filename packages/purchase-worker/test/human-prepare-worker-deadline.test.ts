import { expect, it, vi } from "vitest";
import {
  createHumanPrepareWorker,
  HUMAN_PREPARE_CHECKPOINT_RESERVE_MS,
  HUMAN_PREPARE_WORKER_LEASE_MS,
} from "../src/index.js";
import {
  officialHash,
  workerTestContext,
} from "./human-prepare-worker.fixtures.js";

function worker(context: Awaited<ReturnType<typeof workerTestContext>>) {
  return createHumanPrepareWorker({
    repository: context.repository,
    resolveAuthority: async () => context.restored,
    createReaders: () => context.readers,
    recomputeOfficialHash: officialHash,
  });
}

it("rejects a lease without checkpoint headroom before network reads", async () => {
  const context = await workerTestContext();
  const claim = vi.mocked(context.repository.claimHumanPrepareAuthority);
  const original = claim.getMockImplementation()!;
  claim.mockImplementationOnce(async (input) => {
    await original(input);
    return {
      lease: Object.freeze({
        ...context.lease,
        leaseExpiresAt: new Date(Date.now() + 1_000).toISOString(),
      }),
      intent: context.intent,
    };
  });

  await expect(
    worker(context).runOne({ leaseOwner: "near-expiry-worker" }),
  ).rejects.toMatchObject({ code: "HUMAN_PREPARE_LEASE_EXPIRED" });
  expect(context.readers.holdings.readLedgerEnd).not.toHaveBeenCalled();
  expect(context.completeHumanPrepare).not.toHaveBeenCalled();
});

it("cancels in-flight external reads without checkpointing", async () => {
  const context = await workerTestContext();
  const controller = new AbortController();
  let started!: () => void;
  const readStarted = new Promise<void>((resolve) => (started = resolve));
  context.readers.holdings.readLedgerEnd.mockImplementationOnce(async () => {
    started();
    return new Promise<never>(() => undefined);
  });
  const run = worker(context).runOne({
    leaseOwner: "cancelled-network-worker",
    signal: controller.signal,
  });

  await readStarted;
  controller.abort("private caller reason");

  await expect(run).rejects.toMatchObject({ code: "HUMAN_PREPARE_CANCELLED" });
  expect(context.completeHumanPrepare).not.toHaveBeenCalled();
});

it("bounds an authority resolver that ignores its lease signal", async () => {
  const context = await workerTestContext();
  vi.useFakeTimers({ now: new Date() });
  try {
    let started!: () => void;
    const resolverStarted = new Promise<void>((resolve) => (started = resolve));
    const run = createHumanPrepareWorker({
      repository: context.repository,
      resolveAuthority: async () => {
        started();
        return new Promise<never>(() => undefined);
      },
      createReaders: () => context.readers,
      recomputeOfficialHash: officialHash,
    }).runOne({ leaseOwner: "hung-resolver-worker" });
    let rejection: unknown;
    void run.catch((error: unknown) => {
      rejection = error;
    });

    await resolverStarted;
    await vi.advanceTimersByTimeAsync(
      HUMAN_PREPARE_WORKER_LEASE_MS - HUMAN_PREPARE_CHECKPOINT_RESERVE_MS + 1,
    );

    expect(rejection).toMatchObject({ code: "HUMAN_PREPARE_LEASE_EXPIRED" });
    expect(context.readers.holdings.readLedgerEnd).not.toHaveBeenCalled();
    expect(context.completeHumanPrepare).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it("cancels a resolver that ignores the caller signal", async () => {
  const context = await workerTestContext();
  const controller = new AbortController();
  let started!: () => void;
  const resolverStarted = new Promise<void>((resolve) => (started = resolve));
  const run = createHumanPrepareWorker({
    repository: context.repository,
    resolveAuthority: async () => {
      started();
      return new Promise<never>(() => undefined);
    },
    createReaders: () => context.readers,
    recomputeOfficialHash: officialHash,
  }).runOne({
    leaseOwner: "cancelled-resolver-worker",
    signal: controller.signal,
  });

  await resolverStarted;
  controller.abort("private caller reason");

  await expect(run).rejects.toMatchObject({ code: "HUMAN_PREPARE_CANCELLED" });
  expect(context.readers.holdings.readLedgerEnd).not.toHaveBeenCalled();
  expect(context.completeHumanPrepare).not.toHaveBeenCalled();
});
