import type { Pool } from "pg";
import {
  matchesPrepareCheckpoint,
  prepareCheckpointEventHash,
  type PrepareCheckpointRow,
  validatePrepareCheckpoint,
} from "./purchase-prepare-checkpoint-validation.js";
import { purchaseTransaction } from "./purchase-transaction.js";
import {
  PurchasePersistenceError,
  type HumanPrepareCheckpointResult,
} from "./purchase-types.js";

export async function checkpointHumanPreparedPurchase(
  pool: Pool,
  candidateLease: unknown,
  prepared: unknown,
): Promise<HumanPrepareCheckpointResult> {
  const { authority, lease } = validatePrepareCheckpoint(
    candidateLease,
    prepared,
  );
  return purchaseTransaction(pool, async (client) => {
    const found = await client.query<PrepareCheckpointRow>(
      `SELECT attempt.attempt_id AS "attemptId", attempt.state,
        attempt.request_commitment AS "requestCommitment",
        attempt.challenge_id AS "challengeId",
        attempt.purchase_commitment AS "purchaseCommitment",
        attempt.begin_exclusive::text AS "beginExclusive",
        attempt.execute_before AS "executeBefore",
        event.event_hash AS "previousEventHash",
        event.sequence::text AS "eventSequence", event.event_type AS "eventType",
        job.job_id::text AS "jobId", job.kind AS "jobKind",
        job.state AS "jobState",
        job.lease_generation::text AS "leaseGeneration",
        job.lease_owner AS "leaseOwner",
        job.lease_expires_at AS "leaseExpiresAt",
        job.claimed_at AS "claimedAt",
        authority.retired_at AS "authorityRetiredAt"
       FROM sotto.purchase_attempts attempt
       JOIN sotto.attempt_events event
         ON event.attempt_id = attempt.attempt_id AND event.sequence = 1
       JOIN sotto.outbox_jobs job ON job.attempt_id = attempt.attempt_id
       JOIN sotto.private_prepare_authorities authority
         ON authority.attempt_id = attempt.attempt_id
       WHERE attempt.attempt_id = $1
       FOR UPDATE OF attempt, job, authority`,
      [lease.attemptId],
    );
    const row = found.rows[0];
    if (
      found.rows.length !== 1 ||
      row === undefined ||
      !matchesPrepareCheckpoint(row, lease, authority)
    ) {
      throw new PurchasePersistenceError();
    }
    const eventHash = prepareCheckpointEventHash(row, lease, authority);
    const event = await client.query<{ recordedAt: Date }>(
      `INSERT INTO sotto.attempt_events
        (attempt_id, sequence, event_type, event_hash, previous_event_hash,
         prepared_transaction_hash, transfer_context_hash, prepared_verified_at)
       VALUES ($1, 2, 'prepared-hash-verified', $2, $3, $4, $5, $6)
       RETURNING recorded_at AS "recordedAt"`,
      [
        lease.attemptId,
        eventHash,
        row.previousEventHash,
        authority.preparedTransactionHash,
        authority.transferContextHash,
        authority.verifiedAt,
      ],
    );
    const settlement = await client.query(
      `INSERT INTO sotto.settlements
        (attempt_id, command_id, expectation_schema, expectation,
         expectation_digest, reconciliation_offset)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        lease.attemptId,
        authority.settlement.commandId,
        authority.settlement.schema,
        authority.settlement.json,
        authority.settlement.digest,
        row.beginExclusive,
      ],
    );
    const attempt = await client.query(
      `UPDATE sotto.purchase_attempts
       SET state = 'prepared-hash-verified', prepared_transaction_hash = $2,
         transfer_context_hash = $3, prepared_verified_at = $4
       WHERE attempt_id = $1 AND state = 'intent-created'`,
      [
        lease.attemptId,
        authority.preparedTransactionHash,
        authority.transferContextHash,
        authority.verifiedAt,
      ],
    );
    const job = await client.query<{ completedAt: Date }>(
      `UPDATE sotto.outbox_jobs
       SET state = 'completed', result_event_sequence = 2,
         completed_at = transaction_timestamp()
       WHERE job_id = $1 AND attempt_id = $2 AND state = 'leased'
         AND lease_generation = $3 AND lease_owner = $4
         AND lease_expires_at > clock_timestamp()
       RETURNING completed_at AS "completedAt"`,
      [lease.jobId, lease.attemptId, lease.leaseGeneration, lease.leaseOwner],
    );
    const retired = await client.query(
      `UPDATE sotto.private_prepare_authorities
       SET retired_at = transaction_timestamp()
       WHERE attempt_id = $1 AND retired_at IS NULL`,
      [lease.attemptId],
    );
    if (
      event.rows.length !== 1 ||
      settlement.rowCount !== 1 ||
      attempt.rowCount !== 1 ||
      job.rows.length !== 1 ||
      retired.rowCount !== 1
    ) {
      throw new PurchasePersistenceError();
    }
    return Object.freeze({
      outcome: "prepared-hash-verified",
      attemptId: lease.attemptId,
      state: "prepared-hash-verified",
      preparedTransactionHash: authority.preparedTransactionHash,
      transferContextHash: authority.transferContextHash,
      verifiedAt: authority.verifiedAt,
      event: Object.freeze({
        sequence: 2,
        type: "prepared-hash-verified",
        eventHash,
        previousEventHash: row.previousEventHash as `sha256:${string}`,
        recordedAt: event.rows[0]!.recordedAt.toISOString(),
      }),
      job: Object.freeze({
        jobId: lease.jobId,
        state: "completed",
        completedAt: job.rows[0]!.completedAt.toISOString(),
      }),
    });
  });
}
