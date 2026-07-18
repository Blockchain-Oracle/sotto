import type {
  HumanWalletApprovalStarted,
  HumanWalletSigningResult,
} from "@sotto/x402-canton";
import { readHumanPrepareWorkerApproval } from "./human-prepare-worker-result-state.js";
import {
  HumanWalletExecutionWorkerError,
  type HumanWalletExecutionPrepared,
  type HumanWalletExecutionStarted,
  type HumanWalletExecutionWorkerDependencies,
} from "./human-wallet-execution-worker-types.js";

export function executionDependencies(
  candidate: HumanWalletExecutionWorkerDependencies,
) {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    typeof candidate.repository?.recordHumanApprovalRequested !== "function" ||
    typeof candidate.repository?.recordHumanWalletDecision !== "function" ||
    typeof candidate.repository?.recordHumanSignatureVerified !== "function" ||
    typeof candidate.repository?.beginHumanExecution !== "function" ||
    typeof candidate.repository?.readHumanPurchaseLifecycle !== "function" ||
    typeof candidate.resolveRegisteredPublicKey !== "function" ||
    typeof candidate.executeTransport?.createDispatch !== "function" ||
    (candidate.createSigningSession !== undefined &&
      typeof candidate.createSigningSession !== "function")
  ) {
    throw new Error("human wallet execution dependencies are invalid");
  }
  return candidate;
}

export function executionApproval(prepared: HumanWalletExecutionPrepared) {
  if (
    typeof prepared !== "object" ||
    prepared === null ||
    prepared.outcome !== "prepared-hash-verified"
  ) {
    throw new Error("human wallet execution approval is invalid");
  }
  const projected = readHumanPrepareWorkerApproval(prepared);
  if (
    JSON.stringify(projected) !== JSON.stringify(prepared.approval) ||
    prepared.checkpoint.attemptId !== projected.attemptId ||
    prepared.checkpoint.preparedTransactionHash !==
      projected.preparedTransactionHash ||
    prepared.checkpoint.transferContextHash !== projected.transferContextHash
  ) {
    throw new Error("human wallet execution approval is inconsistent");
  }
  return projected;
}

export type ProjectedExecutionApproval = ReturnType<typeof executionApproval>;

export function expectedExecutionCommandId(
  projected: ProjectedExecutionApproval,
): string {
  return `sotto-human-purchase-v1-${projected.purchaseCommitment.slice(7)}`;
}

export function requireSigningIdentity(
  signing: HumanWalletSigningResult,
  started: HumanWalletApprovalStarted | undefined,
): asserts started is HumanWalletApprovalStarted {
  if (
    started === undefined ||
    signing.outcome === "unsupported" ||
    signing.connectorId !== started.connectorId ||
    signing.connectorKind !== started.connectorKind ||
    signing.sessionId !== started.sessionId
  ) {
    throw new Error("human wallet signing identity is inconsistent");
  }
}

export function isExecutionAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

export function executionFailure(signal: AbortSignal | undefined): never {
  throw new HumanWalletExecutionWorkerError(
    isExecutionAborted(signal)
      ? "HUMAN_WALLET_EXECUTION_CANCELLED"
      : "HUMAN_WALLET_EXECUTION_FAILED",
  );
}

export function humanExecutionResult(
  attemptId: `sha256:${string}`,
  outcome:
    "execution-submitted" | "execution-uncertain" | "reconciliation-only",
  started: HumanWalletExecutionStarted,
) {
  return Object.freeze({
    attemptId,
    outcome,
    sessionId: started.sessionId,
    submissionId: started.submissionId,
    userId: started.userId,
  });
}
