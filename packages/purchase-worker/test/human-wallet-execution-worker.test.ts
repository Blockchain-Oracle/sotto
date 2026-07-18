import { expect, it, vi } from "vitest";
import { createHumanWalletExecutionWorker } from "../src/index.js";
import {
  EXECUTION_USER_ID,
  executionRepository,
  preparedWorkerResult,
  RAW_SIGNATURE_SENTINEL,
  rejectedSigningResult,
  SESSION_ID,
  SUBMISSION_ID,
  unsupportedSigningResult,
  verifiedSigningResult,
} from "./human-wallet-execution-worker.fixtures.js";

function submitted(preparedTransactionHash: `sha256:${string}`) {
  return Object.freeze({
    outcome: "submitted" as const,
    preparedTransactionHash,
  });
}

function dispatch(
  preparedTransactionHash: `sha256:${string}`,
  execute: () => Promise<ReturnType<typeof submitted>>,
) {
  return Object.freeze({
    execute,
    preparedTransactionHash,
    sessionId: SESSION_ID,
    submissionId: SUBMISSION_ID,
    userId: EXECUTION_USER_ID,
  });
}

it("commits approval and execution fences before external calls", async () => {
  const prepared = await preparedWorkerResult();
  const repository = executionRepository(prepared);
  const order: string[] = [];
  repository.recordHumanApprovalRequested.mockImplementation(async () => {
    order.push("approval-persisted");
    return { outcome: "created" } as never;
  });
  repository.recordHumanSignatureVerified.mockImplementation(async () => {
    order.push("signature-persisted");
    return { outcome: "created" } as never;
  });
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
      order.push("connector-called");
      return verifiedSigningResult(prepared);
    }),
    resolveRegisteredPublicKey: vi.fn(),
    executeTransport: {
      createDispatch: vi.fn(async () =>
        dispatch(prepared.approval.preparedTransactionHash, async () => {
          order.push("execute-http");
          return submitted(prepared.approval.preparedTransactionHash);
        }),
      ),
    },
  });

  const result = await worker.runOne({ prepared });
  expect(result).toMatchObject({
    outcome: "execution-submitted",
    submissionId: SUBMISSION_ID,
  });
  expect(order).toEqual([
    "approval-persisted",
    "connector-called",
    "signature-persisted",
    "execution-fenced",
    "execute-http",
  ]);
  const persisted = [
    ...repository.recordHumanApprovalRequested.mock.calls,
    ...repository.recordHumanWalletDecision.mock.calls,
    ...repository.recordHumanSignatureVerified.mock.calls,
    ...repository.beginHumanExecution.mock.calls,
  ];
  expect(JSON.stringify(persisted)).not.toContain(RAW_SIGNATURE_SENTINEL);
  expect(JSON.stringify(result)).not.toContain(RAW_SIGNATURE_SENTINEL);
});

it.each([
  ["rejected", rejectedSigningResult()],
  ["unsupported", unsupportedSigningResult()],
] as const)("persists %s without execution", async (outcome, signing) => {
  const prepared = await preparedWorkerResult();
  const repository = executionRepository(prepared);
  const createDispatch = vi.fn();
  const worker = createHumanWalletExecutionWorker({
    repository,
    createSigningSession: vi.fn(async (_input, _dependencies, options) => {
      if (signing.outcome === "rejected") {
        await options.onApprovalRequested?.({
          connectorId: signing.connectorId,
          connectorKind: signing.connectorKind,
          sessionId: signing.sessionId,
        });
      }
      return signing;
    }),
    resolveRegisteredPublicKey: vi.fn(),
    executeTransport: { createDispatch },
  });

  await expect(worker.runOne({ prepared })).resolves.toMatchObject({
    outcome: `wallet-${outcome}`,
  });
  expect(repository.recordHumanWalletDecision).toHaveBeenCalledOnce();
  expect(repository.recordHumanSignatureVerified).not.toHaveBeenCalled();
  expect(createDispatch).not.toHaveBeenCalled();
});

it("does not call the connector until approval persistence commits", async () => {
  const prepared = await preparedWorkerResult();
  const repository = executionRepository(prepared);
  let release!: () => void;
  const committed = new Promise<void>((resolve) => (release = resolve));
  repository.recordHumanApprovalRequested.mockImplementation(async () => {
    await committed;
    return { outcome: "created" } as never;
  });
  const connector = vi.fn();
  const worker = createHumanWalletExecutionWorker({
    repository,
    createSigningSession: vi.fn(async (_input, _dependencies, options) => {
      await options.onApprovalRequested?.({
        connectorId: "sotto-reference-wallet",
        connectorKind: "wallet-sdk",
        sessionId: SESSION_ID,
      });
      connector();
      return rejectedSigningResult();
    }),
    resolveRegisteredPublicKey: vi.fn(),
    executeTransport: { createDispatch: vi.fn() },
  });
  const run = worker.runOne({ prepared });

  await vi.waitFor(() =>
    expect(repository.recordHumanApprovalRequested).toHaveBeenCalledOnce(),
  );
  expect(connector).not.toHaveBeenCalled();
  release();
  await expect(run).resolves.toMatchObject({ outcome: "wallet-rejected" });
  expect(connector).toHaveBeenCalledOnce();
});

it("makes pre-fence persistence failures execute nothing", async () => {
  const prepared = await preparedWorkerResult();
  const repository = executionRepository(prepared);
  repository.beginHumanExecution.mockRejectedValue(new Error("database down"));
  const executeHttp = vi.fn();
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
      createDispatch: vi.fn(async () =>
        dispatch(prepared.approval.preparedTransactionHash, async () => {
          executeHttp();
          return submitted(prepared.approval.preparedTransactionHash);
        }),
      ),
    },
  });

  await expect(worker.runOne({ prepared })).rejects.toThrow(
    /human wallet execution/iu,
  );
  expect(executeHttp).not.toHaveBeenCalled();
});

it.each([
  ["replayed", false],
  ["created", true],
] as const)(
  "never resubmits after a %s execution fence",
  async (fenceOutcome, executeFails) => {
    const prepared = await preparedWorkerResult();
    const repository = executionRepository(prepared);
    repository.beginHumanExecution.mockResolvedValue({
      outcome: fenceOutcome,
    } as never);
    const executeHttp = vi.fn(() => {
      if (executeFails) throw new Error("connection lost");
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
        createDispatch: vi.fn(async () =>
          dispatch(prepared.approval.preparedTransactionHash, async () => {
            executeHttp();
            return submitted(prepared.approval.preparedTransactionHash);
          }),
        ),
      },
    });

    await expect(worker.runOne({ prepared })).resolves.toMatchObject({
      outcome:
        fenceOutcome === "replayed"
          ? "reconciliation-only"
          : "execution-uncertain",
    });
    expect(executeHttp).toHaveBeenCalledTimes(executeFails ? 1 : 0);
  },
);
