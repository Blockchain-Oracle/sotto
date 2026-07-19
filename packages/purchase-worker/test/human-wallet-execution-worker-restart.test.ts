import { expect, it, vi } from "vitest";
import {
  createHumanWalletSigningSession,
  HUMAN_WALLET_SIGNING_RESPONSE_VERSION,
} from "@sotto/x402-canton";
import { createHumanWalletExecutionWorker } from "../src/index.js";
import { executionApproval } from "../src/human-wallet-execution-worker-validation.js";
import {
  EXECUTION_USER_ID,
  executionRepository,
  preparedWorkerResult,
  SESSION_ID,
  SUBMISSION_ID,
} from "./human-wallet-execution-worker.fixtures.js";

it("reconciles the exact prepared handoff after its signing authority is consumed", async () => {
  const prepared = await preparedWorkerResult(async (candidate) => {
    const request = candidate as Readonly<{ sessionId: string }>;
    return {
      version: HUMAN_WALLET_SIGNING_RESPONSE_VERSION,
      outcome: "rejected",
      reason: "user-rejected",
      sessionId: request.sessionId,
    };
  });
  const projected = executionApproval(prepared);
  expect(() => executionApproval({ ...prepared } as never)).toThrow(
    /not authenticated/iu,
  );
  await expect(
    createHumanWalletSigningSession(prepared.handoff, {
      resolveRegisteredPublicKey: vi.fn(),
    }),
  ).resolves.toMatchObject({ outcome: "rejected" });
  const repository = executionRepository(prepared);
  repository.readHumanPurchaseLifecycle.mockResolvedValue({
    attemptId: projected.attemptId,
    commandId: `sotto-human-purchase-v1-${projected.purchaseCommitment.slice(7)}`,
    state: "execution-started",
    preparedTransactionHash: projected.preparedTransactionHash,
    connectorId: "sotto-reference-wallet",
    connectorKind: "wallet-sdk",
    sessionId: SESSION_ID,
    submissionId: SUBMISSION_ID,
    userId: EXECUTION_USER_ID,
    latestEventSequence: 5,
    latestEventType: "execution-started",
  } as never);
  const createSigningSession = vi.fn();
  const createDispatch = vi.fn();
  const worker = createHumanWalletExecutionWorker({
    repository,
    createSigningSession,
    resolveRegisteredPublicKey: vi.fn(),
    executeTransport: { createDispatch },
  });

  await expect(worker.runOne({ prepared })).resolves.toMatchObject({
    attemptId: projected.attemptId,
    outcome: "reconciliation-only",
    submissionId: SUBMISSION_ID,
  });
  expect(createSigningSession).not.toHaveBeenCalled();
  expect(createDispatch).not.toHaveBeenCalled();

  await expect(
    worker.runOne({ prepared: { ...prepared } as never }),
  ).rejects.toThrow(/human wallet execution/iu);
});
