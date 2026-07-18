import { describe, expect, it, vi } from "vitest";
import {
  PurchasePersistenceError,
  type PurchaseRepository,
} from "@sotto/database";
import { createHumanPrepareWorker } from "../src/index.js";
import {
  officialHash,
  workerTestContext,
} from "./human-prepare-worker.fixtures.js";

describe("one-shot human prepare worker", () => {
  it("does no network work when the PostgreSQL queue is idle", async () => {
    const createReaders = vi.fn();
    const resolveAuthority = vi.fn();
    const repository = {
      claimHumanPrepareAuthority: vi.fn(async () => null),
      completeHumanPrepare: vi.fn(),
    } as unknown as PurchaseRepository;
    const worker = createHumanPrepareWorker({
      repository,
      resolveAuthority,
      createReaders,
      recomputeOfficialHash: officialHash,
    });

    await expect(worker.runOne({ leaseOwner: "idle-worker" })).resolves.toEqual(
      { outcome: "idle" },
    );
    expect(createReaders).not.toHaveBeenCalled();
    expect(resolveAuthority).not.toHaveBeenCalled();
  });

  it("rejects caller cancellation before claiming PostgreSQL work", async () => {
    const context = await workerTestContext();
    const controller = new AbortController();
    controller.abort("private caller reason");
    const worker = createHumanPrepareWorker({
      repository: context.repository,
      resolveAuthority: async () => context.restored,
      createReaders: () => context.readers,
      recomputeOfficialHash: officialHash,
    });

    await expect(
      worker.runOne({
        leaseOwner: "cancelled-worker",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "HUMAN_PREPARE_CANCELLED" });
    expect(
      context.repository.claimHumanPrepareAuthority,
    ).not.toHaveBeenCalled();
  });

  it("checkpoints the real verified prepare path before wallet handoff", async () => {
    const context = await workerTestContext();
    const resolveAuthority = vi.fn(async () => context.restored);
    const worker = createHumanPrepareWorker({
      repository: context.repository,
      resolveAuthority,
      createReaders: () => context.readers,
      recomputeOfficialHash: officialHash,
    });

    const result = await worker.runOne({
      leaseOwner: "successful-worker",
    });

    expect(result).toMatchObject({
      outcome: "prepared-hash-verified",
      checkpoint: { state: "prepared-hash-verified" },
      approval: {
        action: "pay-for-api-call",
        attemptId: context.intent.attemptId,
      },
      handoff: { preflight: context.restored.walletPreflight },
    });
    expect(resolveAuthority).toHaveBeenCalledOnce();
    expect(context.readers.holdings.readLedgerEnd).toHaveBeenCalledOnce();
    expect(context.readers.holdings.readActiveContracts).toHaveBeenCalledOnce();
    expect(context.readers.registry).toHaveBeenCalledOnce();
    expect(context.readers.prepared).toHaveBeenCalledOnce();
    expect(context.completeHumanPrepare).toHaveBeenCalledOnce();
    expect(Object.keys(result)).not.toContain("preparedTransaction");
  });

  it("returns no wallet handoff when the generation fence rejects completion", async () => {
    const context = await workerTestContext();
    context.completeHumanPrepare.mockRejectedValueOnce(
      new PurchasePersistenceError(),
    );
    const worker = createHumanPrepareWorker({
      repository: context.repository,
      resolveAuthority: async () => context.restored,
      createReaders: () => context.readers,
      recomputeOfficialHash: officialHash,
    });

    await expect(
      worker.runOne({ leaseOwner: "stale-worker" }),
    ).rejects.toMatchObject({ code: "HUMAN_PREPARE_FAILED" });
  });
});
