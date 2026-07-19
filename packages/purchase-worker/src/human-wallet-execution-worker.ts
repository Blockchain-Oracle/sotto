import {
  createHumanWalletSigningSession,
  type HumanWalletApprovalStarted,
} from "@sotto/x402-canton";
import {
  executionDispatch,
  lifecycleExecution,
  requireExecutionLifecycle,
  requireSubmitted,
} from "./human-wallet-execution-worker-state.js";
import type {
  HumanWalletExecutionStarted,
  HumanWalletExecutionWorker,
  HumanWalletExecutionWorkerDependencies,
} from "./human-wallet-execution-worker-types.js";
import {
  executionApproval,
  executionDependencies,
  executionFailure,
  humanExecutionResult,
  isExecutionAborted,
  requireSigningIdentity,
} from "./human-wallet-execution-worker-validation.js";

export function createHumanWalletExecutionWorker(
  candidate: HumanWalletExecutionWorkerDependencies,
): HumanWalletExecutionWorker {
  const inputDependencies = executionDependencies(candidate);
  const createSigningSession =
    inputDependencies.createSigningSession ?? createHumanWalletSigningSession;
  return Object.freeze({
    runOne: async ({ prepared, signal }) => {
      let durableStarted: HumanWalletExecutionStarted | undefined;
      let reconciliationStarted: HumanWalletExecutionStarted | undefined;
      try {
        if (isExecutionAborted(signal)) executionFailure(signal);
        const projected = executionApproval(prepared);
        const initial =
          await inputDependencies.repository.readHumanPurchaseLifecycle(
            projected.attemptId,
          );
        reconciliationStarted = lifecycleExecution(initial, projected);
        if (reconciliationStarted !== undefined) {
          return humanExecutionResult(
            projected.attemptId,
            "reconciliation-only",
            reconciliationStarted,
          );
        }
        requireExecutionLifecycle(initial, projected, "prepared-hash-verified");
        if (isExecutionAborted(signal)) executionFailure(signal);

        let approvalStarted: HumanWalletApprovalStarted | undefined;
        const signing = await createSigningSession(
          prepared.handoff,
          {
            resolveRegisteredPublicKey:
              inputDependencies.resolveRegisteredPublicKey,
          },
          {
            ...(signal === undefined ? {} : { signal }),
            onApprovalRequested: async (started) => {
              if (approvalStarted !== undefined) executionFailure(signal);
              const transition =
                await inputDependencies.repository.recordHumanApprovalRequested(
                  {
                    attemptId: projected.attemptId,
                    preparedTransactionHash: projected.preparedTransactionHash,
                    connectorId: started.connectorId,
                    connectorKind: started.connectorKind,
                    sessionId: started.sessionId,
                  },
                );
              if (transition.outcome !== "created") {
                const current =
                  await inputDependencies.repository.readHumanPurchaseLifecycle(
                    projected.attemptId,
                  );
                reconciliationStarted = lifecycleExecution(current, projected);
                throw new Error("human wallet approval is already persisted");
              }
              if (isExecutionAborted(signal)) executionFailure(signal);
              approvalStarted = started;
            },
          },
        );
        if (isExecutionAborted(signal)) executionFailure(signal);
        if (signing.outcome === "unsupported") {
          if (approvalStarted !== undefined) executionFailure(signal);
          await inputDependencies.repository.recordHumanWalletDecision({
            attemptId: projected.attemptId,
            preparedTransactionHash: projected.preparedTransactionHash,
            connectorId: signing.connectorId,
            connectorKind: signing.connectorKind,
            outcome: "unsupported",
            reason: signing.reason,
          });
          return Object.freeze({
            attemptId: projected.attemptId,
            connectorId: signing.connectorId,
            connectorKind: signing.connectorKind,
            outcome: "wallet-unsupported" as const,
            reason: signing.reason,
          });
        }
        requireSigningIdentity(signing, approvalStarted);
        if (signing.outcome === "rejected") {
          await inputDependencies.repository.recordHumanWalletDecision({
            attemptId: projected.attemptId,
            preparedTransactionHash: projected.preparedTransactionHash,
            connectorId: signing.connectorId,
            connectorKind: signing.connectorKind,
            outcome: "rejected",
            reason: signing.reason,
            sessionId: signing.sessionId,
          });
          return Object.freeze({
            attemptId: projected.attemptId,
            connectorId: signing.connectorId,
            connectorKind: signing.connectorKind,
            outcome: "wallet-rejected" as const,
            reason: signing.reason,
          });
        }
        if (
          signing.preparedTransactionHash !== projected.preparedTransactionHash
        ) {
          executionFailure(signal);
        }
        const signatureTransition =
          await inputDependencies.repository.recordHumanSignatureVerified({
            attemptId: projected.attemptId,
            preparedTransactionHash: signing.preparedTransactionHash,
            connectorId: signing.connectorId,
            connectorKind: signing.connectorKind,
            sessionId: signing.sessionId,
            verifiedAt: signing.verifiedAt,
          });
        if (isExecutionAborted(signal)) executionFailure(signal);
        if (signatureTransition.outcome !== "created") {
          const current =
            await inputDependencies.repository.readHumanPurchaseLifecycle(
              projected.attemptId,
            );
          reconciliationStarted = lifecycleExecution(current, projected);
          if (reconciliationStarted !== undefined) {
            return humanExecutionResult(
              projected.attemptId,
              "reconciliation-only",
              reconciliationStarted,
            );
          }
          executionFailure(signal);
        }
        const lifecycle =
          await inputDependencies.repository.readHumanPurchaseLifecycle(
            projected.attemptId,
          );
        reconciliationStarted = lifecycleExecution(lifecycle, projected);
        if (reconciliationStarted !== undefined) {
          return humanExecutionResult(
            projected.attemptId,
            "reconciliation-only",
            reconciliationStarted,
          );
        }
        requireExecutionLifecycle(lifecycle, projected, "signature-verified");
        if (isExecutionAborted(signal)) executionFailure(signal);

        const dispatch = executionDispatch(
          await inputDependencies.executeTransport.createDispatch(signing, {
            ...(signal === undefined ? {} : { signal }),
          }),
          signing,
          projected,
        );
        if (isExecutionAborted(signal)) executionFailure(signal);
        let transition;
        try {
          transition = await inputDependencies.repository.beginHumanExecution({
            attemptId: projected.attemptId,
            commandId: lifecycle.commandId,
            preparedTransactionHash: projected.preparedTransactionHash,
            sessionId: dispatch.started.sessionId,
            submissionId: dispatch.started.submissionId,
            userId: dispatch.started.userId,
          });
        } catch {
          const current =
            await inputDependencies.repository.readHumanPurchaseLifecycle(
              projected.attemptId,
            );
          reconciliationStarted = lifecycleExecution(current, projected);
          if (reconciliationStarted !== undefined) {
            return humanExecutionResult(
              projected.attemptId,
              "reconciliation-only",
              reconciliationStarted,
            );
          }
          executionFailure(signal);
        }
        if (transition.outcome !== "created") {
          return humanExecutionResult(
            projected.attemptId,
            "reconciliation-only",
            dispatch.started,
          );
        }
        durableStarted = dispatch.started;
        if (isExecutionAborted(signal)) {
          return humanExecutionResult(
            projected.attemptId,
            "execution-uncertain",
            durableStarted,
          );
        }
        try {
          const submitted = await dispatch.execute({
            ...(signal === undefined ? {} : { signal }),
          });
          requireSubmitted(submitted, projected);
          return humanExecutionResult(
            projected.attemptId,
            "execution-submitted",
            durableStarted,
          );
        } catch {
          return humanExecutionResult(
            projected.attemptId,
            "execution-uncertain",
            durableStarted,
          );
        }
      } catch {
        if (reconciliationStarted !== undefined) {
          return humanExecutionResult(
            prepared.approval.attemptId,
            "reconciliation-only",
            reconciliationStarted,
          );
        }
        if (durableStarted !== undefined) {
          return humanExecutionResult(
            prepared.approval.attemptId,
            "execution-uncertain",
            durableStarted,
          );
        }
        executionFailure(signal);
      }
    },
  });
}
