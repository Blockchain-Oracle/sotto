import { validateReconcileJob } from "./purchase-human-reconcile-job-oracle.js";
import type { HumanJournalOracle } from "./purchase-human-journal-oracle.js";
import type {
  HumanEventTransitionRow,
  HumanTransitionState,
} from "./purchase-human-transition-types.js";
import { PurchasePersistenceError } from "./purchase-types.js";

function timestamp(value: Date | null): string | null {
  if (value === null) return null;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new PurchasePersistenceError();
  }
  return value.toISOString();
}

function required(
  journal: HumanJournalOracle,
  type: string,
): HumanEventTransitionRow {
  const event = journal.event(type);
  if (event === undefined) throw new PurchasePersistenceError();
  return event;
}

export function validateHumanTerminalState(
  state: HumanTransitionState,
  journal: HumanJournalOracle,
): void {
  const terminal = journal.terminal;
  const approval = required(journal, "approval-requested");
  const signature = required(journal, "signature-verified");
  const execution = required(journal, "execution-started");
  const settlement = state.settlement;
  const job = state.jobs[0];
  if (
    terminal === null ||
    settlement === null ||
    job === undefined ||
    state.attempt.connectorId !== approval.connectorId ||
    state.attempt.connectorKind !== approval.connectorKind ||
    state.attempt.sessionId !== approval.sessionId ||
    timestamp(state.attempt.approvalRequestedAt) !==
      timestamp(approval.recordedAt) ||
    timestamp(state.attempt.signatureVerifiedAt) !==
      timestamp(signature.signatureVerifiedAt) ||
    state.attempt.submissionId !== execution.submissionId ||
    state.attempt.executionUserId !== execution.executionUserId ||
    timestamp(state.attempt.executionStartedAt) !==
      timestamp(execution.executionStartedAt) ||
    settlement.attemptId !== state.attempt.attemptId ||
    settlement.commandId !== state.attempt.commandId ||
    settlement.state !== terminal.type ||
    settlement.submissionId !== execution.submissionId ||
    settlement.executionUserId !== execution.executionUserId ||
    timestamp(settlement.executionStartedAt) !==
      timestamp(execution.executionStartedAt) ||
    settlement.reconciliationOffset !== String(terminal.reconciliationOffset) ||
    settlement.completionOffset !== String(terminal.completionOffset) ||
    settlement.updateId !== terminal.updateId ||
    settlement.rejectionStatusCode !== terminal.rejectionStatusCode ||
    timestamp(settlement.reconciledAt) !== terminal.reconciledAt ||
    timestamp(job.completedAt) !== terminal.reconciledAt
  ) {
    throw new PurchasePersistenceError();
  }
  validateReconcileJob(state, execution);
}
