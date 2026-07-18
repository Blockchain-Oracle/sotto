import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  executionEventHash,
  reconcileJobDedupe,
  signatureEventHash,
  transitionResult,
} from "./purchase-human-event.js";
import { lockHumanTransitionState } from "./purchase-human-transition-row.js";
import type { HumanEventTransitionRow } from "./purchase-human-transition-types.js";
import {
  executionTransitionInput,
  signatureTransitionInput,
} from "./purchase-human-transition-validation.js";
import { validateHumanTransitionState } from "./purchase-human-state-oracle.js";
import { purchaseTransaction } from "./purchase-transaction.js";
import {
  PurchaseConflictError,
  PurchasePersistenceError,
  type HumanPurchaseTransitionResult,
} from "./purchase-types.js";

type Signature = ReturnType<typeof signatureTransitionInput>;
type Execution = ReturnType<typeof executionTransitionInput>;

function matchesSignature(
  event: HumanEventTransitionRow,
  input: Signature,
  preparedTransactionHash: string | null,
): boolean {
  return (
    preparedTransactionHash === input.preparedTransactionHash &&
    event.attemptId === input.attemptId &&
    event.type === "signature-verified" &&
    event.connectorKind === input.connectorKind &&
    event.connectorId === input.connectorId &&
    event.sessionId === input.sessionId &&
    event.signatureVerifiedAt?.toISOString() === input.verifiedAt
  );
}

function matchesExecution(
  event: HumanEventTransitionRow,
  input: Execution,
  preparedTransactionHash: string | null,
  commandId: string,
): boolean {
  return (
    preparedTransactionHash === input.preparedTransactionHash &&
    commandId === input.commandId &&
    event.attemptId === input.attemptId &&
    event.type === "execution-started" &&
    event.sessionId === input.sessionId &&
    event.submissionId === input.submissionId &&
    event.executionUserId === input.userId
  );
}

export async function recordSignatureVerified(
  pool: Pool,
  candidate: unknown,
): Promise<HumanPurchaseTransitionResult> {
  const input = signatureTransitionInput(candidate);
  return purchaseTransaction(pool, async (client) => {
    const state = await lockHumanTransitionState(client, input.attemptId);
    const journal = await validateHumanTransitionState(client, state);
    const replay = journal.event("signature-verified");
    if (replay !== undefined) {
      if (
        !matchesSignature(replay, input, state.attempt.preparedTransactionHash)
      ) {
        throw new PurchaseConflictError();
      }
      return transitionResult(replay, "replayed");
    }
    const approval = journal.event("approval-requested");
    const verifiedAt = Date.parse(input.verifiedAt);
    const databaseNow = state.databaseNow.getTime();
    const executeBefore = state.attempt.executeBefore.getTime();
    if (
      !journal.executionEligible ||
      journal.latest.type !== "approval-requested" ||
      approval === undefined ||
      state.attempt.preparedTransactionHash !== input.preparedTransactionHash ||
      approval.connectorKind !== input.connectorKind ||
      approval.connectorId !== input.connectorId ||
      approval.sessionId !== input.sessionId ||
      verifiedAt < approval.recordedAt.getTime() ||
      verifiedAt > databaseNow ||
      verifiedAt >= executeBefore ||
      databaseNow >= executeBefore
    ) {
      throw new PurchaseConflictError();
    }
    const recordedAt = state.databaseNow.toISOString();
    const eventHash = signatureEventHash(
      input,
      recordedAt,
      journal.latest.eventHash,
    );
    const event = await client.query(
      `INSERT INTO sotto.attempt_events
        (attempt_id, sequence, event_type, event_hash, previous_event_hash,
         wallet_session_id, wallet_connector_kind, wallet_connector_id,
         signature_verified_at, recorded_at)
       VALUES ($1, 4, 'signature-verified', $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.attemptId,
        eventHash,
        journal.latest.eventHash,
        input.sessionId,
        input.connectorKind,
        input.connectorId,
        input.verifiedAt,
        recordedAt,
      ],
    );
    const attempt = await client.query(
      `UPDATE sotto.purchase_attempts
       SET state = 'signature-verified', signature_verified_at = $2
       WHERE attempt_id = $1 AND state = 'approval-requested'
         AND $2::timestamptz < execute_before
         AND clock_timestamp() < execute_before`,
      [input.attemptId, input.verifiedAt],
    );
    if (event.rowCount !== 1 || attempt.rowCount !== 1) {
      throw new PurchasePersistenceError();
    }
    const created = await lockHumanTransitionState(client, input.attemptId);
    const verified = await validateHumanTransitionState(client, created);
    return transitionResult(verified.event("signature-verified")!, "created");
  });
}

export async function beginExecution(
  pool: Pool,
  candidate: unknown,
): Promise<HumanPurchaseTransitionResult> {
  const input = executionTransitionInput(candidate);
  return purchaseTransaction(pool, async (client) => {
    const state = await lockHumanTransitionState(client, input.attemptId);
    const journal = await validateHumanTransitionState(client, state);
    const replay = journal.event("execution-started");
    if (replay !== undefined) {
      if (
        !matchesExecution(
          replay,
          input,
          state.attempt.preparedTransactionHash,
          state.attempt.commandId,
        )
      ) {
        throw new PurchaseConflictError();
      }
      return transitionResult(replay, "replayed");
    }
    const signature = journal.event("signature-verified");
    if (
      !journal.executionEligible ||
      journal.latest.type !== "signature-verified" ||
      signature === undefined ||
      state.attempt.commandId !== input.commandId ||
      state.attempt.preparedTransactionHash !== input.preparedTransactionHash ||
      signature.sessionId !== input.sessionId ||
      state.databaseNow.getTime() >= state.attempt.executeBefore.getTime()
    ) {
      throw new PurchaseConflictError();
    }
    const recordedAt = state.databaseNow.toISOString();
    const eventHash = executionEventHash(
      input,
      recordedAt,
      journal.latest.eventHash,
    );
    const event = await client.query(
      `INSERT INTO sotto.attempt_events
        (attempt_id, sequence, event_type, event_hash, previous_event_hash,
         wallet_session_id, wallet_connector_kind, wallet_connector_id,
         submission_id, execution_user_id, execution_started_at, recorded_at)
       VALUES ($1, 5, 'execution-started', $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [
        input.attemptId,
        eventHash,
        journal.latest.eventHash,
        input.sessionId,
        signature.connectorKind,
        signature.connectorId,
        input.submissionId,
        input.userId,
        recordedAt,
      ],
    );
    const attempt = await client.query(
      `UPDATE sotto.purchase_attempts
       SET state = 'execution-started', submission_id = $2,
         execution_user_id = $3, execution_started_at = $4
       WHERE attempt_id = $1 AND state = 'signature-verified'
         AND clock_timestamp() < execute_before`,
      [input.attemptId, input.submissionId, input.userId, recordedAt],
    );
    const settlement = await client.query(
      `UPDATE sotto.settlements
       SET state = 'execution-started', submission_id = $2,
         execution_user_id = $3, execution_started_at = $4
       WHERE attempt_id = $1 AND state = 'prepared'`,
      [input.attemptId, input.submissionId, input.userId, recordedAt],
    );
    const job = await client.query(
      `INSERT INTO sotto.outbox_jobs
        (job_id, dedupe_key, attempt_id, event_sequence, kind,
         available_at, created_at)
       VALUES ($1, $2, $3, 5, 'purchase-reconcile', $4, $4)`,
      [
        randomUUID(),
        reconcileJobDedupe(input.attemptId, eventHash),
        input.attemptId,
        recordedAt,
      ],
    );
    if (
      [event, attempt, settlement, job].some(({ rowCount }) => rowCount !== 1)
    ) {
      throw new PurchasePersistenceError();
    }
    const created = await lockHumanTransitionState(client, input.attemptId);
    const verified = await validateHumanTransitionState(client, created);
    return transitionResult(verified.event("execution-started")!, "created");
  });
}
