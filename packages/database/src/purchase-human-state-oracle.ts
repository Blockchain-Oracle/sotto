import {
  validateHumanJournal,
  type HumanJournalOracle,
} from "./purchase-human-journal-oracle.js";
import { validateReconcileJob } from "./purchase-human-reconcile-job-oracle.js";
import type {
  HumanEventTransitionRow,
  HumanTransitionState,
} from "./purchase-human-transition-types.js";
import { PurchasePersistenceError } from "./purchase-types.js";
import type { PoolClient } from "pg";

function iso(value: Date | null): string | null {
  if (value === null) return null;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new PurchasePersistenceError();
  }
  return value.toISOString();
}

function same(value: unknown, expected: unknown): void {
  if (value !== expected) throw new PurchasePersistenceError();
}

function offset(value: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new PurchasePersistenceError();
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new PurchasePersistenceError();
  }
  return parsed;
}

function requireNoSettlementResult(
  settlement: NonNullable<HumanTransitionState["settlement"]>,
): void {
  if (
    settlement.completionOffset !== null ||
    settlement.updateId !== null ||
    settlement.rejectionStatusCode !== null ||
    settlement.reconciledAt !== null
  ) {
    throw new PurchasePersistenceError();
  }
}

function eventRequired(
  journal: HumanJournalOracle,
  type: string,
): HumanEventTransitionRow {
  const event = journal.event(type);
  if (event === undefined) throw new PurchasePersistenceError();
  return event;
}

function validatePreparedSettlement(state: HumanTransitionState): void {
  const settlement = state.settlement;
  if (
    settlement === null ||
    settlement.attemptId !== state.attempt.attemptId ||
    settlement.commandId !== state.attempt.commandId ||
    settlement.state !== "prepared" ||
    offset(settlement.reconciliationOffset) !==
      offset(state.attempt.beginExclusive) ||
    settlement.submissionId !== null ||
    settlement.executionUserId !== null ||
    settlement.executionStartedAt !== null
  ) {
    throw new PurchasePersistenceError();
  }
  requireNoSettlementResult(settlement);
}

function validateApprovalState(
  state: HumanTransitionState,
  approval: HumanEventTransitionRow,
): void {
  same(state.attempt.connectorId, approval.connectorId);
  same(state.attempt.connectorKind, approval.connectorKind);
  same(state.attempt.sessionId, approval.sessionId);
  same(iso(state.attempt.approvalRequestedAt), iso(approval.recordedAt));
}

function validateExecutionState(
  state: HumanTransitionState,
  journal: HumanJournalOracle,
): void {
  const approval = eventRequired(journal, "approval-requested");
  const signature = eventRequired(journal, "signature-verified");
  const execution = eventRequired(journal, "execution-started");
  validateApprovalState(state, approval);
  same(
    state.attempt.signatureVerifiedAt?.toISOString(),
    iso(signature.signatureVerifiedAt),
  );
  same(state.attempt.submissionId, execution.submissionId);
  same(state.attempt.executionUserId, execution.executionUserId);
  same(
    iso(state.attempt.executionStartedAt),
    iso(execution.executionStartedAt),
  );
  const settlement = state.settlement;
  if (
    settlement === null ||
    settlement.state !== "execution-started" ||
    offset(settlement.reconciliationOffset) <
      offset(state.attempt.beginExclusive) ||
    settlement.submissionId !== execution.submissionId ||
    settlement.executionUserId !== execution.executionUserId ||
    iso(settlement.executionStartedAt) !== iso(execution.executionStartedAt)
  ) {
    throw new PurchasePersistenceError();
  }
  requireNoSettlementResult(settlement);
  validateReconcileJob(state, execution);
}

export async function validateHumanTransitionState(
  client: PoolClient,
  state: HumanTransitionState,
): Promise<HumanJournalOracle> {
  const journal = await validateHumanJournal(client, state);
  if (
    state.attempt.state !== journal.latest.type ||
    state.attempt.preparedTransactionHash === null ||
    state.attempt.transferContextHash === null ||
    state.attempt.preparedVerifiedAt === null ||
    !(state.attempt.executeBefore instanceof Date) ||
    !(state.databaseNow instanceof Date)
  ) {
    throw new PurchasePersistenceError();
  }
  if (journal.latest.type === "prepared-hash-verified") {
    if (journal.executionEligible) validatePreparedSettlement(state);
    if (state.jobs.length !== 0) throw new PurchasePersistenceError();
    return journal;
  }
  if (!journal.executionEligible) throw new PurchasePersistenceError();
  if (journal.latest.type === "approval-requested") {
    validateApprovalState(state, eventRequired(journal, "approval-requested"));
    validatePreparedSettlement(state);
  } else if (journal.latest.type === "wallet-unsupported") {
    const decision = eventRequired(journal, "wallet-unsupported");
    same(state.attempt.connectorId, decision.connectorId);
    same(state.attempt.connectorKind, decision.connectorKind);
    same(state.attempt.sessionId, null);
    same(state.attempt.decisionReason, decision.decisionReason);
    same(iso(state.attempt.walletDecidedAt), iso(decision.recordedAt));
    validatePreparedSettlement(state);
  } else if (journal.latest.type === "wallet-rejected") {
    const approval = eventRequired(journal, "approval-requested");
    const decision = eventRequired(journal, "wallet-rejected");
    validateApprovalState(state, approval);
    same(state.attempt.decisionReason, decision.decisionReason);
    same(iso(state.attempt.walletDecidedAt), iso(decision.recordedAt));
    validatePreparedSettlement(state);
  } else if (journal.latest.type === "signature-verified") {
    const approval = eventRequired(journal, "approval-requested");
    const signature = eventRequired(journal, "signature-verified");
    validateApprovalState(state, approval);
    same(
      iso(state.attempt.signatureVerifiedAt),
      iso(signature.signatureVerifiedAt),
    );
    validatePreparedSettlement(state);
  } else if (journal.latest.type === "execution-started") {
    validateExecutionState(state, journal);
  } else {
    throw new PurchasePersistenceError();
  }
  if (journal.latest.type !== "execution-started" && state.jobs.length !== 0) {
    throw new PurchasePersistenceError();
  }
  return journal;
}
