import type { HumanPurchaseLifecycle } from "@sotto/database";
import type { HumanWalletSigningResult } from "@sotto/x402-canton";
import type {
  HumanWalletExecutionDispatch,
  HumanWalletExecutionStarted,
} from "./human-wallet-execution-worker-types.js";
import {
  expectedExecutionCommandId,
  type ProjectedExecutionApproval,
} from "./human-wallet-execution-worker-validation.js";

const SHA256 = /^sha256:[0-9a-f]{64}$/u;

function isSafeText(value: string): boolean {
  if (value.length < 1 || value.length > 255) return false;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x1f || codeUnit === 0x7f) return false;
  }
  return true;
}

export function lifecycleExecution(
  lifecycle: HumanPurchaseLifecycle,
  projected: ProjectedExecutionApproval,
): HumanWalletExecutionStarted | undefined {
  if (lifecycle.state !== "execution-started") return undefined;
  if (
    lifecycle.attemptId !== projected.attemptId ||
    lifecycle.commandId !== expectedExecutionCommandId(projected) ||
    lifecycle.preparedTransactionHash !== projected.preparedTransactionHash ||
    lifecycle.latestEventSequence !== 5 ||
    lifecycle.latestEventType !== "execution-started" ||
    lifecycle.connectorId === null ||
    lifecycle.connectorKind === null ||
    lifecycle.sessionId === null ||
    !SHA256.test(lifecycle.sessionId) ||
    lifecycle.submissionId === null ||
    !isSafeText(lifecycle.submissionId) ||
    lifecycle.userId === null ||
    !isSafeText(lifecycle.userId)
  ) {
    throw new Error("human wallet execution lifecycle is inconsistent");
  }
  return Object.freeze({
    sessionId: lifecycle.sessionId,
    submissionId: lifecycle.submissionId,
    userId: lifecycle.userId,
  });
}

export function requireExecutionLifecycle(
  lifecycle: HumanPurchaseLifecycle,
  projected: ProjectedExecutionApproval,
  expectedState: "prepared-hash-verified" | "signature-verified",
): void {
  if (
    lifecycle.attemptId !== projected.attemptId ||
    lifecycle.commandId !== expectedExecutionCommandId(projected) ||
    lifecycle.preparedTransactionHash !== projected.preparedTransactionHash ||
    lifecycle.state !== expectedState
  ) {
    throw new Error("human wallet execution lifecycle is not eligible");
  }
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  return (
    JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...expected].sort())
  );
}

export function executionDispatch(
  candidate: HumanWalletExecutionDispatch,
  signing: Extract<HumanWalletSigningResult, { outcome: "verified" }>,
  projected: ProjectedExecutionApproval,
) {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !exactKeys(candidate, [
      "execute",
      "preparedTransactionHash",
      "sessionId",
      "submissionId",
      "userId",
    ]) ||
    candidate.sessionId !== signing.sessionId ||
    !SHA256.test(candidate.sessionId) ||
    candidate.preparedTransactionHash !== projected.preparedTransactionHash ||
    !isSafeText(candidate.submissionId) ||
    !isSafeText(candidate.userId) ||
    typeof candidate.execute !== "function"
  ) {
    throw new Error("human wallet execution dispatch is invalid");
  }
  return Object.freeze({
    execute: candidate.execute,
    started: Object.freeze({
      sessionId: candidate.sessionId,
      submissionId: candidate.submissionId,
      userId: candidate.userId,
    }),
  });
}

export function requireSubmitted(
  submitted: unknown,
  projected: ProjectedExecutionApproval,
): void {
  if (
    typeof submitted !== "object" ||
    submitted === null ||
    !exactKeys(submitted, ["outcome", "preparedTransactionHash"]) ||
    !("outcome" in submitted) ||
    submitted.outcome !== "submitted" ||
    !("preparedTransactionHash" in submitted) ||
    submitted.preparedTransactionHash !== projected.preparedTransactionHash
  ) {
    throw new Error("human wallet execution result is invalid");
  }
}
