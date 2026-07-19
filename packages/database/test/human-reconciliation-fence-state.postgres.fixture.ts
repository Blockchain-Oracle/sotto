import { Client } from "pg";
import type { ReconciliationTestContext } from "./human-reconciliation.postgres.fixture.js";

export type TerminalSnapshot = Readonly<{
  attemptState: string;
  commandId: string;
  submissionId: string;
  executionUserId: string;
  executionStartedAt: Date;
  settlementState: string;
  expectationDigest: string;
  reconciliationOffset: string;
  completionOffset: string | null;
  updateId: string | null;
  rejectionStatusCode: number | null;
  settlementReconciledAt: Date | null;
  executionEventHash: string;
  eventType: string | null;
  eventHash: string | null;
  previousEventHash: string | null;
  eventCompletionOffset: string | null;
  eventUpdateId: string | null;
  eventRejectionStatusCode: number | null;
  eventReconciledAt: Date | null;
  eventRecordedAt: Date | null;
  jobId: string;
  jobState: string;
  generation: string;
  leaseOwner: string | null;
  claimedAt: Date | null;
  leaseExpiresAt: Date | null;
  resultEventSequence: string | null;
  completedAt: Date | null;
  eventCount: string;
}>;

export async function terminalSnapshot(
  context: ReconciliationTestContext,
  attemptId: string,
): Promise<TerminalSnapshot> {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    const result = await client.query<TerminalSnapshot>(
      `SELECT attempt.state AS "attemptState", attempt.command_id AS "commandId",
        attempt.submission_id::text AS "submissionId",
        attempt.execution_user_id AS "executionUserId",
        attempt.execution_started_at AS "executionStartedAt",
        settlement.state AS "settlementState",
        settlement.expectation_digest AS "expectationDigest",
        settlement.reconciliation_offset::text AS "reconciliationOffset",
        settlement.completion_offset::text AS "completionOffset",
        settlement.update_id AS "updateId",
        settlement.rejection_status_code AS "rejectionStatusCode",
        settlement.reconciled_at AS "settlementReconciledAt",
        execution.event_hash AS "executionEventHash",
        event.event_type AS "eventType", event.event_hash AS "eventHash",
        event.previous_event_hash AS "previousEventHash",
        event.completion_offset::text AS "eventCompletionOffset",
        event.update_id AS "eventUpdateId",
        event.rejection_status_code AS "eventRejectionStatusCode",
        event.reconciled_at AS "eventReconciledAt",
        event.recorded_at AS "eventRecordedAt",
        job.job_id::text AS "jobId", job.state AS "jobState",
        job.lease_generation::text AS generation,
        job.lease_owner AS "leaseOwner", job.claimed_at AS "claimedAt",
        job.lease_expires_at AS "leaseExpiresAt",
        job.result_event_sequence::text AS "resultEventSequence",
        job.completed_at AS "completedAt",
        (SELECT count(*)::text FROM sotto.attempt_events counted
          WHERE counted.attempt_id = attempt.attempt_id) AS "eventCount"
       FROM sotto.purchase_attempts attempt
       JOIN sotto.settlements settlement
         ON settlement.attempt_id = attempt.attempt_id
       JOIN sotto.outbox_jobs job ON job.attempt_id = attempt.attempt_id
         AND job.kind = 'purchase-reconcile'
       JOIN sotto.attempt_events execution
         ON execution.attempt_id = attempt.attempt_id AND execution.sequence = 5
       LEFT JOIN sotto.attempt_events event
         ON event.attempt_id = attempt.attempt_id AND event.sequence = 6
       WHERE attempt.attempt_id = $1`,
      [attemptId],
    );
    if (result.rows.length !== 1)
      throw new Error("terminal snapshot is absent");
    return result.rows[0]!;
  } finally {
    await client.end();
  }
}

async function terminalFaultDdl(
  context: ReconciliationTestContext,
  sql: string,
): Promise<void> {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

export async function terminalFault(
  context: ReconciliationTestContext,
): Promise<() => Promise<void>> {
  await terminalFaultDdl(
    context,
    `CREATE FUNCTION sotto.reject_terminal_job()
     RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN
       IF NEW.kind = 'purchase-reconcile' AND NEW.state = 'completed' THEN
         RAISE EXCEPTION 'forced terminal job failure';
       END IF;
       RETURN NEW;
     END $$`,
  );
  try {
    await terminalFaultDdl(
      context,
      `CREATE TRIGGER reject_terminal_job BEFORE UPDATE ON sotto.outbox_jobs
       FOR EACH ROW EXECUTE FUNCTION sotto.reject_terminal_job()`,
    );
  } catch (error) {
    await terminalFaultDdl(
      context,
      "DROP FUNCTION IF EXISTS sotto.reject_terminal_job()",
    );
    throw error;
  }
  return () =>
    terminalFaultDdl(
      context,
      `DROP TRIGGER IF EXISTS reject_terminal_job ON sotto.outbox_jobs;
       DROP FUNCTION IF EXISTS sotto.reject_terminal_job()`,
    );
}
