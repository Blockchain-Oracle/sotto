import type {
  HumanReconciliationClaimResult,
  HumanReconciliationCheckpointInput,
  HumanReconciliationCheckpointResult,
  HumanReconciliationCompletion,
  PurchaseRepository,
} from "../src/index.js";
import {
  createExecutionStartedAttempt,
  type ReconciliationTestContext,
} from "./human-reconciliation.postgres.fixture.js";

export const TERMINAL_UPDATE_A = `1220${"a".repeat(64)}`;
export const TERMINAL_UPDATE_B = `1220${"b".repeat(64)}`;

export type TerminalCompletion = HumanReconciliationCompletion;
export type TerminalCheckpointInput = HumanReconciliationCheckpointInput;
export type TerminalCheckpointResult = HumanReconciliationCheckpointResult;
export type TerminalRepository = PurchaseRepository;

export async function claimTerminalAttempt(
  context: ReconciliationTestContext,
  windowSeconds: number,
  leaseOwner: string,
  leaseMilliseconds = 60_000,
  beginExclusive = 42,
) {
  const attempt = await createExecutionStartedAttempt(
    context,
    windowSeconds,
    beginExclusive,
  );
  try {
    const claim = await attempt.purchase.claimHumanReconciliation({
      attemptId: attempt.initialized.attemptId,
      leaseMilliseconds,
      leaseOwner,
    });
    if (claim === null) throw new Error("terminal test lease is absent");
    return {
      ...attempt,
      claim,
      terminal: attempt.purchase,
    };
  } catch (error) {
    await attempt.purchase.close();
    throw error;
  }
}

export function succeededCheckpoint(
  claim: HumanReconciliationClaimResult,
  completionOffset = claim.scope.reconciliationOffset + 1,
  updateId = TERMINAL_UPDATE_A,
): TerminalCheckpointInput {
  return {
    lease: claim.lease,
    expectedReconciliationOffset: claim.scope.reconciliationOffset,
    completion: { classification: "SUCCEEDED", completionOffset, updateId },
  };
}

export function rejectedCheckpoint(
  claim: HumanReconciliationClaimResult,
  completionOffset = claim.scope.reconciliationOffset + 1,
  statusCode = 7,
): TerminalCheckpointInput {
  return {
    lease: claim.lease,
    expectedReconciliationOffset: claim.scope.reconciliationOffset,
    completion: { classification: "REJECTED", completionOffset, statusCode },
  };
}
