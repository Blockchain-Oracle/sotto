import { expect, it, vi } from "vitest";
import { createHumanWalletExecutionWorker } from "../src/index.js";
import {
  EXECUTION_USER_ID,
  executionRepository,
  preparedWorkerResult,
  SESSION_ID,
  SUBMISSION_ID,
  verifiedSigningResult,
} from "./human-wallet-execution-worker.fixtures.js";

it("short-circuits durable execution before another wallet call", async () => {
  const prepared = await preparedWorkerResult();
  const repository = executionRepository(prepared);
  repository.readHumanPurchaseLifecycle.mockResolvedValue({
    attemptId: prepared.approval.attemptId,
    commandId: `sotto-human-purchase-v1-${prepared.approval.purchaseCommitment.slice(7)}`,
    state: "execution-started",
    preparedTransactionHash: prepared.approval.preparedTransactionHash,
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
    outcome: "reconciliation-only",
    submissionId: SUBMISSION_ID,
  });
  expect(createSigningSession).not.toHaveBeenCalled();
  expect(createDispatch).not.toHaveBeenCalled();
});

it("does not enter the network execute method before the durable fence", async () => {
  const prepared = await preparedWorkerResult();
  const repository = executionRepository(prepared);
  const order: string[] = [];
  repository.beginHumanExecution.mockImplementation(async () => {
    order.push("execution-fenced");
    return { outcome: "created" } as never;
  });
  const worker = createHumanWalletExecutionWorker({
    repository,
    createSigningSession: vi.fn(async (_input, _dependencies, options) => {
      await options.onApprovalRequested?.({
        connectorId: "sotto-reference-wallet",
        connectorKind: "wallet-sdk",
        sessionId: SESSION_ID,
      });
      return verifiedSigningResult(prepared);
    }),
    resolveRegisteredPublicKey: vi.fn(),
    executeTransport: {
      createDispatch: vi.fn(async () => ({
        preparedTransactionHash: prepared.approval.preparedTransactionHash,
        sessionId: SESSION_ID,
        submissionId: SUBMISSION_ID,
        userId: EXECUTION_USER_ID,
        execute: async () => {
          order.push("execute-entered");
          throw new Error("response lost");
        },
      })),
    },
  });

  await expect(worker.runOne({ prepared })).resolves.toMatchObject({
    outcome: "execution-uncertain",
  });
  expect(order).toEqual(["execution-fenced", "execute-entered"]);
});
