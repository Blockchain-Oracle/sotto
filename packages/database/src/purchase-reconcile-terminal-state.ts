import type { HumanJournalOracle } from "./purchase-human-journal-oracle.js";
import type { HumanTransitionState } from "./purchase-human-transition-types.js";
import type {
  HumanReconciliationCheckpointInput,
  HumanReconciliationCheckpointResult,
} from "./purchase-reconciliation-types.js";
import {
  PurchaseConflictError,
  PurchasePersistenceError,
} from "./purchase-types.js";

function leaseMatches(
  state: HumanTransitionState,
  input: HumanReconciliationCheckpointInput,
): boolean {
  const job = state.jobs[0];
  return (
    state.jobs.length === 1 &&
    job !== undefined &&
    state.attempt.attemptId === input.lease.attemptId &&
    job.jobId === input.lease.jobId &&
    job.leaseGeneration === String(input.lease.leaseGeneration) &&
    job.leaseOwner === input.lease.leaseOwner &&
    job.claimedAt?.toISOString() === input.lease.claimedAt &&
    job.leaseExpiresAt?.toISOString() === input.lease.leaseExpiresAt
  );
}

export function requireActiveTerminalLease(
  state: HumanTransitionState,
  input: HumanReconciliationCheckpointInput,
): void {
  const job = state.jobs[0];
  if (
    !leaseMatches(state, input) ||
    job?.state !== "leased" ||
    state.attempt.state !== "execution-started" ||
    state.settlement?.state !== "execution-started" ||
    state.settlement.reconciliationOffset !==
      String(input.expectedReconciliationOffset) ||
    job.resultEventSequence !== null ||
    job.completedAt !== null ||
    job.leaseExpiresAt === null ||
    job.leaseExpiresAt.getTime() <= state.databaseNow.getTime()
  ) {
    throw new PurchasePersistenceError();
  }
}

function checkpointResult(
  state: HumanTransitionState,
  journal: HumanJournalOracle,
  outcome: "created" | "replayed",
): HumanReconciliationCheckpointResult {
  const terminal = journal.terminal;
  const event = state.events[5];
  const job = state.jobs[0];
  if (
    terminal === null ||
    event === undefined ||
    event.previousEventHash === null ||
    job === undefined ||
    job.completedAt === null
  ) {
    throw new PurchasePersistenceError();
  }
  const completion =
    terminal.type === "settlement-reconciled"
      ? Object.freeze({
          classification: "SUCCEEDED" as const,
          completionOffset: terminal.completionOffset,
          updateId: terminal.updateId!,
        })
      : Object.freeze({
          classification: "REJECTED" as const,
          completionOffset: terminal.completionOffset,
          statusCode: terminal.rejectionStatusCode!,
        });
  return Object.freeze({
    outcome,
    attemptId: state.attempt.attemptId as `sha256:${string}`,
    state: terminal.type,
    completion,
    reconciliationOffset: terminal.reconciliationOffset,
    reconciledAt: terminal.reconciledAt,
    event: Object.freeze({
      sequence: 6 as const,
      type: terminal.type,
      eventHash: event.eventHash as `sha256:${string}`,
      previousEventHash: event.previousEventHash as `sha256:${string}`,
      recordedAt: event.recordedAt.toISOString(),
    }),
    job: Object.freeze({
      jobId: job.jobId,
      state: "completed" as const,
      leaseGeneration: Number(job.leaseGeneration),
      resultEventSequence: 6 as const,
      completedAt: job.completedAt.toISOString(),
    }),
  });
}

export function terminalCreatedResult(
  state: HumanTransitionState,
  journal: HumanJournalOracle,
): HumanReconciliationCheckpointResult {
  return checkpointResult(state, journal, "created");
}

export function terminalReplayResult(
  state: HumanTransitionState,
  journal: HumanJournalOracle,
  input: HumanReconciliationCheckpointInput,
): HumanReconciliationCheckpointResult {
  if (!leaseMatches(state, input)) throw new PurchasePersistenceError();
  const terminal = journal.terminal;
  const completion = input.completion;
  const same =
    terminal !== null &&
    terminal.reconciliationOffset === input.expectedReconciliationOffset &&
    terminal.completionOffset === completion.completionOffset &&
    ((completion.classification === "SUCCEEDED" &&
      terminal.type === "settlement-reconciled" &&
      terminal.updateId === completion.updateId) ||
      (completion.classification === "REJECTED" &&
        terminal.type === "settlement-rejected" &&
        terminal.rejectionStatusCode === completion.statusCode));
  if (!same) throw new PurchaseConflictError();
  return checkpointResult(state, journal, "replayed");
}
