import { expect, it, vi } from "vitest";
import type { HumanWalletSigningSessionOptions } from "@sotto/x402-canton";
import { createHumanWalletExecutionWorker } from "../src/index.js";
import {
  EXECUTION_USER_ID,
  executionRepository,
  preparedWorkerResult,
  RAW_SIGNATURE_SENTINEL,
  SESSION_ID,
  SUBMISSION_ID,
  verifiedSigningResult,
} from "./human-wallet-execution-worker.fixtures.js";

function signingSession(
  prepared: Awaited<ReturnType<typeof preparedWorkerResult>>,
) {
  return vi.fn(
    async (
      _input: unknown,
      _dependencies: unknown,
      options: HumanWalletSigningSessionOptions = {},
    ) => {
      await options.onApprovalRequested?.({
        connectorId: "sotto-reference-wallet",
        connectorKind: "wallet-sdk",
        sessionId: SESSION_ID,
      });
      return verifiedSigningResult(prepared);
    },
  );
}

it("makes approval persistence failure stop before the connector", async () => {
  const prepared = await preparedWorkerResult();
  const repository = executionRepository(prepared);
  repository.recordHumanApprovalRequested.mockRejectedValue(
    new Error("private database detail"),
  );
  const connector = vi.fn();
  const createDispatch = vi.fn();
  const worker = createHumanWalletExecutionWorker({
    repository,
    createSigningSession: vi.fn(async (_input, _dependencies, options) => {
      await options.onApprovalRequested?.({
        connectorId: "sotto-reference-wallet",
        connectorKind: "wallet-sdk",
        sessionId: SESSION_ID,
      });
      connector();
      return verifiedSigningResult(prepared);
    }),
    resolveRegisteredPublicKey: vi.fn(),
    executeTransport: { createDispatch },
  });

  await expect(worker.runOne({ prepared })).rejects.toMatchObject({
    code: "HUMAN_WALLET_EXECUTION_FAILED",
  });
  expect(connector).not.toHaveBeenCalled();
  expect(createDispatch).not.toHaveBeenCalled();
});

it("makes signature persistence failure stop before execute transport", async () => {
  const prepared = await preparedWorkerResult();
  const repository = executionRepository(prepared);
  repository.recordHumanSignatureVerified.mockRejectedValue(
    new Error("private database detail"),
  );
  const createDispatch = vi.fn();
  const worker = createHumanWalletExecutionWorker({
    repository,
    createSigningSession: signingSession(prepared),
    resolveRegisteredPublicKey: vi.fn(),
    executeTransport: { createDispatch },
  });

  await expect(worker.runOne({ prepared })).rejects.toMatchObject({
    code: "HUMAN_WALLET_EXECUTION_FAILED",
  });
  expect(createDispatch).not.toHaveBeenCalled();
});

it("rejects a cloned authenticated handoff before persistence", async () => {
  const prepared = await preparedWorkerResult();
  const repository = executionRepository(prepared);
  const createSigningSession = signingSession(prepared);
  const worker = createHumanWalletExecutionWorker({
    repository,
    createSigningSession,
    resolveRegisteredPublicKey: vi.fn(),
    executeTransport: { createDispatch: vi.fn() },
  });
  const forged = {
    ...prepared,
    handoff: {
      ...prepared.handoff,
      prepared: { ...prepared.handoff.prepared },
    },
  };

  await expect(worker.runOne({ prepared: forged as never })).rejects.toThrow(
    /human wallet execution|not authenticated/iu,
  );
  expect(createSigningSession).not.toHaveBeenCalled();
  expect(repository.recordHumanApprovalRequested).not.toHaveBeenCalled();
  expect(repository.recordHumanSignatureVerified).not.toHaveBeenCalled();
  expect(repository.beginHumanExecution).not.toHaveBeenCalled();
});

it("cancels after a blocked signature write without creating a dispatch", async () => {
  const prepared = await preparedWorkerResult();
  const repository = executionRepository(prepared);
  const controller = new AbortController();
  let writeStarted!: () => void;
  let releaseWrite!: () => void;
  const started = new Promise<void>((resolve) => (writeStarted = resolve));
  const released = new Promise<void>((resolve) => (releaseWrite = resolve));
  repository.recordHumanSignatureVerified.mockImplementation(async () => {
    writeStarted();
    await released;
    return { outcome: "created" } as never;
  });
  const createDispatch = vi.fn();
  const worker = createHumanWalletExecutionWorker({
    repository,
    createSigningSession: signingSession(prepared),
    resolveRegisteredPublicKey: vi.fn(),
    executeTransport: { createDispatch },
  });
  const run = worker.runOne({ prepared, signal: controller.signal });

  await started;
  controller.abort();
  releaseWrite();

  await expect(run).rejects.toMatchObject({
    code: "HUMAN_WALLET_EXECUTION_CANCELLED",
  });
  expect(createDispatch).not.toHaveBeenCalled();
  expect(repository.beginHumanExecution).not.toHaveBeenCalled();
});

it("does not execute after cancellation races with a committed fence", async () => {
  const prepared = await preparedWorkerResult();
  const repository = executionRepository(prepared);
  const controller = new AbortController();
  let fenceStarted!: () => void;
  let releaseFence!: () => void;
  const started = new Promise<void>((resolve) => (fenceStarted = resolve));
  const released = new Promise<void>((resolve) => (releaseFence = resolve));
  repository.beginHumanExecution.mockImplementation(async () => {
    fenceStarted();
    await released;
    return { outcome: "created" } as never;
  });
  const execute = vi.fn();
  const worker = createHumanWalletExecutionWorker({
    repository,
    createSigningSession: signingSession(prepared),
    resolveRegisteredPublicKey: vi.fn(),
    executeTransport: {
      createDispatch: async () => ({
        execute,
        preparedTransactionHash: prepared.approval.preparedTransactionHash,
        sessionId: SESSION_ID,
        submissionId: SUBMISSION_ID,
        userId: EXECUTION_USER_ID,
      }),
    },
  });
  const run = worker.runOne({ prepared, signal: controller.signal });

  await started;
  controller.abort();
  releaseFence();

  await expect(run).resolves.toMatchObject({
    outcome: "execution-uncertain",
    submissionId: SUBMISSION_ID,
  });
  expect(execute).not.toHaveBeenCalled();
});

it("rejects execution identity enriched with raw signing material", async () => {
  const prepared = await preparedWorkerResult();
  const repository = executionRepository(prepared);
  const execute = vi.fn();
  const worker = createHumanWalletExecutionWorker({
    repository,
    createSigningSession: signingSession(prepared),
    resolveRegisteredPublicKey: vi.fn(),
    executeTransport: {
      createDispatch: async () =>
        ({
          execute,
          preparedTransactionHash: prepared.approval.preparedTransactionHash,
          rawSignature: RAW_SIGNATURE_SENTINEL,
          sessionId: SESSION_ID,
          submissionId: SUBMISSION_ID,
          userId: EXECUTION_USER_ID,
        }) as never,
    },
  });

  await expect(worker.runOne({ prepared })).rejects.toMatchObject({
    code: "HUMAN_WALLET_EXECUTION_FAILED",
  });
  expect(repository.beginHumanExecution).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});
