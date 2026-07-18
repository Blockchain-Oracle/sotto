import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  reconciledEventHash,
  rejectedSettlementEventHash,
} from "./purchase-human-event.js";
import { lockHumanTransitionState } from "./purchase-human-transition-row.js";
import { validateHumanTransitionState } from "./purchase-human-state-oracle.js";
import {
  requireActiveTerminalLease,
  terminalCreatedResult,
  terminalReplayResult,
} from "./purchase-reconcile-terminal-state.js";
import { reconciliationCheckpointInput } from "./purchase-reconcile-terminal-validation.js";
import type { HumanReconciliationCheckpointResult } from "./purchase-reconciliation-types.js";
import { readStoredSettlementAuthority } from "./purchase-settlement-row.js";
import { purchaseTransaction } from "./purchase-transaction.js";
import { PurchasePersistenceError } from "./purchase-types.js";

export function completeHumanReconciliationLease(
  pool: Pool,
  candidate: unknown,
): Promise<HumanReconciliationCheckpointResult> {
  const input = reconciliationCheckpointInput(candidate);
  return purchaseTransaction(pool, async (client) => {
    const before = await lockHumanTransitionState(
      client,
      input.lease.attemptId,
    );
    const journal = await validateHumanTransitionState(client, before);
    if (
      journal.latest.type === "settlement-reconciled" ||
      journal.latest.type === "settlement-rejected"
    ) {
      return terminalReplayResult(before, journal, input);
    }
    requireActiveTerminalLease(before, input);
    const authority = await readStoredSettlementAuthority(
      client,
      input.lease.attemptId,
    );
    const execution = before.events[4];
    if (
      authority === null ||
      execution?.type !== "execution-started" ||
      before.attempt.submissionId === null ||
      before.attempt.executionUserId === null
    ) {
      throw new PurchasePersistenceError();
    }
    const time = await client.query<{ now: Date }>(
      `SELECT date_trunc(
         'milliseconds', transaction_timestamp() + interval '1 millisecond'
       ) AS now`,
    );
    const now = time.rows[0]?.now;
    if (!(now instanceof Date)) throw new PurchasePersistenceError();
    const reconciledAt = now.toISOString();
    const common = {
      attemptId: before.attempt.attemptId,
      commandId: before.attempt.commandId,
      submissionId: before.attempt.submissionId,
      executionUserId: before.attempt.executionUserId,
      expectationDigest: authority.digest,
      reconciliationOffset: input.expectedReconciliationOffset,
      completionOffset: input.completion.completionOffset,
    };
    const successful = input.completion.classification === "SUCCEEDED";
    const terminalState = successful
      ? "settlement-reconciled"
      : "settlement-rejected";
    const eventHash = successful
      ? reconciledEventHash(
          { ...common, updateId: input.completion.updateId },
          reconciledAt,
          execution.eventHash,
        )
      : rejectedSettlementEventHash(
          { ...common, statusCode: input.completion.statusCode },
          reconciledAt,
          execution.eventHash,
        );
    const result = successful
      ? { updateId: input.completion.updateId, statusCode: null }
      : { updateId: null, statusCode: input.completion.statusCode };
    const event = await client.query(
      `INSERT INTO sotto.attempt_events
        (attempt_id, sequence, event_type, event_hash, previous_event_hash,
         completion_offset, update_id, rejection_status_code,
         reconciled_at, recorded_at)
       VALUES ($1, 6, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [
        input.lease.attemptId,
        terminalState,
        eventHash,
        execution.eventHash,
        input.completion.completionOffset,
        result.updateId,
        result.statusCode,
        now,
      ],
    );
    const attempt = await client.query(
      `UPDATE sotto.purchase_attempts SET state = $2
       WHERE attempt_id = $1 AND state = 'execution-started'
         AND command_id = $3 AND submission_id = $4::uuid
         AND execution_user_id = $5`,
      [
        input.lease.attemptId,
        terminalState,
        before.attempt.commandId,
        before.attempt.submissionId,
        before.attempt.executionUserId,
      ],
    );
    const settlement = await client.query(
      `UPDATE sotto.settlements
       SET state = $2, completion_offset = $3,
         update_id = $4, rejection_status_code = $5, reconciled_at = $6
       WHERE attempt_id = $1 AND state = 'execution-started'
         AND command_id = $7 AND submission_id = $8::uuid
         AND execution_user_id = $9 AND reconciliation_offset = $10
         AND $3::bigint > reconciliation_offset
         AND completion_offset IS NULL AND update_id IS NULL
         AND rejection_status_code IS NULL AND reconciled_at IS NULL`,
      [
        input.lease.attemptId,
        terminalState,
        input.completion.completionOffset,
        result.updateId,
        result.statusCode,
        now,
        before.attempt.commandId,
        before.attempt.submissionId,
        before.attempt.executionUserId,
        input.expectedReconciliationOffset,
      ],
    );
    const job = await client.query(
      `UPDATE sotto.outbox_jobs
       SET state = 'completed', result_event_sequence = 6, completed_at = $7
       WHERE job_id = $1::uuid AND attempt_id = $2
         AND kind = 'purchase-reconcile' AND event_sequence = 5
         AND state = 'leased' AND lease_generation = $3
         AND lease_owner = $4
         AND date_trunc('milliseconds', claimed_at) = $5::timestamptz
         AND date_trunc('milliseconds', lease_expires_at) = $6::timestamptz
         AND lease_expires_at > clock_timestamp()
         AND $7::timestamptz >= claimed_at AND $7::timestamptz < lease_expires_at
         AND result_event_sequence IS NULL AND completed_at IS NULL`,
      [
        input.lease.jobId,
        input.lease.attemptId,
        input.lease.leaseGeneration,
        input.lease.leaseOwner,
        input.lease.claimedAt,
        input.lease.leaseExpiresAt,
        now,
      ],
    );
    if (successful) {
      await client.query(
        `INSERT INTO sotto.delivery_claims
          (delivery_id, attempt_id, update_id, request_commitment)
         SELECT $1::uuid, payload.attempt_id, $2, payload.request_commitment
         FROM sotto.private_attempt_payloads payload
         WHERE payload.attempt_id = $3
           AND payload.request_commitment = $4`,
        [
          randomUUID(),
          input.completion.updateId,
          input.lease.attemptId,
          authority.expectation.requestCommitment,
        ],
      );
    }
    if (
      event.rowCount !== 1 ||
      attempt.rowCount !== 1 ||
      settlement.rowCount !== 1 ||
      job.rowCount !== 1
    ) {
      throw new PurchasePersistenceError();
    }
    const after = await lockHumanTransitionState(client, input.lease.attemptId);
    const terminal = await validateHumanTransitionState(client, after);
    return terminalCreatedResult(after, terminal);
  });
}
