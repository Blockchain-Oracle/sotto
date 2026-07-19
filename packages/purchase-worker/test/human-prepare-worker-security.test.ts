import { expect, it, vi } from "vitest";
import {
  createHumanWalletSigningSession,
  HUMAN_WALLET_SIGNING_RESPONSE_VERSION,
  projectHumanPreparedPurchaseApproval,
} from "@sotto/x402-canton";
import { createHumanPrepareWorker } from "../src/index.js";
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

it("returns committed success when cancellation races the checkpoint", async () => {
  const context = await workerTestContext();
  const controller = new AbortController();
  const complete = context.completeHumanPrepare.getMockImplementation()!;
  let started!: () => void;
  let release!: () => void;
  const checkpointStarted = new Promise<void>((resolve) => (started = resolve));
  const checkpointReleased = new Promise<void>(
    (resolve) => (release = resolve),
  );
  context.completeHumanPrepare.mockImplementationOnce(async (input) => {
    started();
    await checkpointReleased;
    return complete(input);
  });
  const run = worker(context).runOne({
    leaseOwner: "completion-race-worker",
    signal: controller.signal,
  });

  await checkpointStarted;
  controller.abort("private caller reason");
  release();

  await expect(run).resolves.toMatchObject({
    outcome: "prepared-hash-verified",
  });
});

it("keeps verified wallet authority usable after a slow checkpoint", async () => {
  const approvalRequests: unknown[] = [];
  const context = await workerTestContext(599, async (candidate) => {
    const request = candidate as Readonly<{ sessionId: string }>;
    approvalRequests.push(candidate);
    return {
      version: HUMAN_WALLET_SIGNING_RESPONSE_VERSION,
      outcome: "rejected",
      reason: "user-rejected",
      sessionId: request.sessionId,
    };
  });
  vi.useFakeTimers({ now: new Date() });
  try {
    const complete = context.completeHumanPrepare.getMockImplementation()!;
    context.completeHumanPrepare.mockImplementationOnce(async (input) => {
      vi.advanceTimersByTime(10_001);
      return complete(input);
    });

    const result = await worker(context).runOne({
      leaseOwner: "slow-checkpoint-worker",
    });
    if (result.outcome !== "prepared-hash-verified") {
      throw new Error("worker did not checkpoint the prepared purchase");
    }

    await expect(
      createHumanWalletSigningSession(result.handoff, {
        resolveRegisteredPublicKey: vi.fn(),
      }),
    ).resolves.toMatchObject({ outcome: "rejected" });
    expect(approvalRequests).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});

it("does not strand a valid 121-second purchase during checkpoint", async () => {
  const context = await workerTestContext(121);
  vi.useFakeTimers({ now: new Date() });
  try {
    const complete = context.completeHumanPrepare.getMockImplementation()!;
    context.completeHumanPrepare.mockImplementationOnce(async (input) => {
      vi.advanceTimersByTime(2_000);
      return complete(input);
    });

    const result = await worker(context).runOne({
      leaseOwner: "minimum-reserve-worker",
    });
    if (result.outcome !== "prepared-hash-verified") {
      throw new Error("worker did not preserve the wallet handoff");
    }
    expect(() =>
      projectHumanPreparedPurchaseApproval(result.handoff.prepared),
    ).not.toThrow();
  } finally {
    vi.useRealTimers();
  }
});
