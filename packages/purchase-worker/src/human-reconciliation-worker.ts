import {
  authenticateHumanPurchaseProviderSettlement,
  readAuthenticatedHumanPurchaseProviderSettlement,
  type HumanPurchaseSettlementProof,
} from "@sotto/x402-canton";
import {
  createHumanReconciliationLeaseDeadline,
  HUMAN_RECONCILIATION_WORKER_LEASE_MS,
  requireReconciliationCallerActive,
  runWithinHumanReconciliationDeadline,
} from "./human-reconciliation-worker-deadline.js";
import {
  requireReconciliationDeferCheckpoint,
  requireReconciliationTerminalCheckpoint,
} from "./human-reconciliation-worker-checkpoint.js";
import {
  createHumanReconciliationWorkerError,
  isWorkerOwnedHumanReconciliationError,
  type HumanReconciliationWorker,
  type HumanReconciliationWorkerDependencies,
} from "./human-reconciliation-worker-types.js";
import {
  reconciliationClaim,
  reconciliationProbeRequest,
} from "./human-reconciliation-worker-claim.js";
import {
  reconciliationProbe,
  reconciliationWorkerDependencies,
  reconciliationWorkerInput,
} from "./human-reconciliation-worker-validation.js";

function workerFailure(
  error: unknown,
  caller?: AbortSignal,
  lease?: AbortSignal,
  checkpointStarted = false,
): never {
  if (checkpointStarted) {
    throw createHumanReconciliationWorkerError("HUMAN_RECONCILIATION_FAILED");
  }
  if (isWorkerOwnedHumanReconciliationError(error)) throw error;
  if (caller?.aborted === true) {
    throw createHumanReconciliationWorkerError(
      "HUMAN_RECONCILIATION_CANCELLED",
    );
  }
  if (lease?.aborted === true) {
    throw createHumanReconciliationWorkerError(
      "HUMAN_RECONCILIATION_LEASE_EXPIRED",
    );
  }
  throw createHumanReconciliationWorkerError("HUMAN_RECONCILIATION_FAILED");
}

function settlementProof(
  expectation: Parameters<
    typeof authenticateHumanPurchaseProviderSettlement
  >[2],
  updateId: string,
): HumanPurchaseSettlementProof {
  return Object.freeze({
    attemptId: expectation.attemptId,
    challengeId: expectation.challengeId,
    requestCommitment: expectation.requestCommitment,
    purchaseCommitment: expectation.purchaseCommitment,
    updateId,
  });
}

export function createHumanReconciliationWorker(
  candidate: HumanReconciliationWorkerDependencies,
): HumanReconciliationWorker {
  const dependencies = reconciliationWorkerDependencies(candidate);
  return Object.freeze({
    runOne: async (candidateInput) => {
      let input;
      try {
        input = reconciliationWorkerInput(candidateInput);
        requireReconciliationCallerActive(input.signal);
      } catch (error) {
        workerFailure(error, candidateInput?.signal);
      }
      let rawClaim;
      try {
        rawClaim = await dependencies.repository.claimHumanReconciliation({
          leaseOwner: input.leaseOwner,
          leaseMilliseconds: HUMAN_RECONCILIATION_WORKER_LEASE_MS,
          ...(input.attemptId === undefined
            ? {}
            : { attemptId: input.attemptId }),
        });
        requireReconciliationCallerActive(input.signal);
      } catch (error) {
        workerFailure(error, input.signal);
      }
      if (rawClaim === null) {
        return Object.freeze({ outcome: "idle" as const });
      }
      let deadline:
        ReturnType<typeof createHumanReconciliationLeaseDeadline> | undefined;
      let checkpointStarted = false;
      try {
        const claim = reconciliationClaim(rawClaim, input.leaseOwner);
        deadline = createHumanReconciliationLeaseDeadline(
          claim.lease,
          input.signal,
        );
        const probeRequest = reconciliationProbeRequest(claim);
        const candidateProbe = await runWithinHumanReconciliationDeadline(
          deadline,
          async () =>
            await dependencies.readReconciliation(
              probeRequest,
              Object.freeze({ signal: deadline!.signal }),
            ),
        );
        deadline.requireActive();
        const probe = reconciliationProbe(
          candidateProbe,
          claim.scope.reconciliationOffset,
          probeRequest,
        );
        if (probe.outcome === "pending") {
          deadline.requireActive();
          checkpointStarted = true;
          const checkpoint =
            await dependencies.repository.deferHumanReconciliation({
              lease: claim.lease,
              expectedReconciliationOffset: claim.scope.reconciliationOffset,
              scannedThroughOffset: probe.scannedThroughOffset,
            });
          return Object.freeze({
            outcome: "pending" as const,
            checkpoint: requireReconciliationDeferCheckpoint(
              checkpoint,
              claim.lease,
              probe.scannedThroughOffset,
            ),
          });
        }
        const completion =
          probe.outcome === "rejected"
            ? Object.freeze({
                classification: "REJECTED" as const,
                completionOffset: probe.completionOffset,
                statusCode: probe.statusCode,
              })
            : Object.freeze({
                classification: "SUCCEEDED" as const,
                completionOffset: probe.completionOffset,
                updateId: probe.updateId,
              });
        if (probe.outcome === "succeeded") {
          const settlement = authenticateHumanPurchaseProviderSettlement(
            probe.transaction,
            settlementProof(claim.scope.expectation, probe.updateId),
            claim.scope.expectation,
          );
          const evidence =
            readAuthenticatedHumanPurchaseProviderSettlement(settlement);
          if (evidence.transactionOffset !== probe.completionOffset) {
            throw new Error("human settlement completion offset differs");
          }
        }
        deadline.requireActive();
        checkpointStarted = true;
        const checkpoint =
          await dependencies.repository.completeHumanReconciliation({
            lease: claim.lease,
            expectedReconciliationOffset: claim.scope.reconciliationOffset,
            completion,
          });
        return Object.freeze({
          outcome:
            probe.outcome === "succeeded"
              ? ("settlement-reconciled" as const)
              : ("settlement-rejected" as const),
          checkpoint: requireReconciliationTerminalCheckpoint(
            checkpoint,
            claim.lease,
            claim.scope.reconciliationOffset,
            completion,
          ),
        });
      } catch (error) {
        workerFailure(error, input.signal, deadline?.signal, checkpointStarted);
      } finally {
        deadline?.dispose();
      }
    },
  });
}
