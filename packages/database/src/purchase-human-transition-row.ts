import type { PoolClient } from "pg";
import { PurchasePersistenceError } from "./purchase-types.js";
import type {
  HumanAttemptTransitionRow,
  HumanEventTransitionRow,
  HumanReconcileJobRow,
  HumanSettlementTransitionRow,
  HumanTransitionState,
} from "./purchase-human-transition-types.js";

async function lockAttempt(
  client: PoolClient,
  attemptId: string,
): Promise<{ attempt: HumanAttemptTransitionRow; databaseNow: Date }> {
  const locked = await client.query(
    "SELECT attempt_id FROM sotto.purchase_attempts WHERE attempt_id = $1 FOR UPDATE",
    [attemptId],
  );
  if (locked.rows.length !== 1) throw new PurchasePersistenceError();
  const result = await client.query<
    HumanAttemptTransitionRow & Readonly<{ databaseNow: Date }>
  >(
    `SELECT attempt_id AS "attemptId", request_hash AS "requestHash", state,
      prepared_transaction_hash AS "preparedTransactionHash",
      transfer_context_hash AS "transferContextHash",
      prepared_verified_at AS "preparedVerifiedAt", command_id AS "commandId",
      execute_before AS "executeBefore", wallet_connector_id AS "connectorId",
      wallet_connector_kind AS "connectorKind", wallet_session_id AS "sessionId",
      wallet_decision_reason AS "decisionReason",
      approval_requested_at AS "approvalRequestedAt",
      wallet_decided_at AS "walletDecidedAt",
      signature_verified_at AS "signatureVerifiedAt",
      submission_id::text AS "submissionId",
      execution_user_id AS "executionUserId",
      execution_started_at AS "executionStartedAt",
      clock_timestamp() AS "databaseNow"
     FROM sotto.purchase_attempts WHERE attempt_id = $1`,
    [attemptId],
  );
  if (result.rows.length !== 1) throw new PurchasePersistenceError();
  const { databaseNow, ...attempt } = result.rows[0]!;
  return { attempt, databaseNow };
}

async function lockSettlement(
  client: PoolClient,
  attemptId: string,
): Promise<HumanSettlementTransitionRow | null> {
  const result = await client.query<HumanSettlementTransitionRow>(
    `SELECT attempt_id AS "attemptId", command_id AS "commandId", state,
      submission_id::text AS "submissionId",
      execution_user_id AS "executionUserId",
      execution_started_at AS "executionStartedAt"
     FROM sotto.settlements WHERE attempt_id = $1 FOR UPDATE`,
    [attemptId],
  );
  if (result.rows.length > 1) throw new PurchasePersistenceError();
  return result.rows[0] ?? null;
}

async function readEvents(
  client: PoolClient,
  attemptId: string,
): Promise<readonly HumanEventTransitionRow[]> {
  const result = await client.query<HumanEventTransitionRow>(
    `SELECT attempt_id AS "attemptId", sequence::text, event_type AS type,
      event_hash AS "eventHash", previous_event_hash AS "previousEventHash",
      recorded_at AS "recordedAt",
      prepared_transaction_hash AS "preparedTransactionHash",
      transfer_context_hash AS "transferContextHash",
      prepared_verified_at AS "preparedVerifiedAt",
      wallet_session_id AS "sessionId",
      wallet_connector_kind AS "connectorKind",
      wallet_connector_id AS "connectorId",
      wallet_decision_reason AS "decisionReason",
      signature_verified_at AS "signatureVerifiedAt",
      submission_id::text AS "submissionId",
      execution_user_id AS "executionUserId",
      execution_started_at AS "executionStartedAt"
     FROM sotto.attempt_events WHERE attempt_id = $1 ORDER BY sequence`,
    [attemptId],
  );
  return Object.freeze(result.rows);
}

async function readJobs(
  client: PoolClient,
  attemptId: string,
): Promise<readonly HumanReconcileJobRow[]> {
  const result = await client.query<HumanReconcileJobRow>(
    `SELECT job_id::text AS "jobId", dedupe_key AS "dedupeKey",
      event_sequence::text AS "eventSequence", kind, state,
      available_at AS "availableAt", created_at AS "createdAt",
      lease_generation::text AS "leaseGeneration", lease_owner AS "leaseOwner",
      lease_expires_at AS "leaseExpiresAt", claimed_at AS "claimedAt",
      result_event_sequence::text AS "resultEventSequence",
      completed_at AS "completedAt"
     FROM sotto.outbox_jobs
     WHERE attempt_id = $1 AND kind = 'purchase-reconcile'
     ORDER BY created_at, job_id`,
    [attemptId],
  );
  return Object.freeze(result.rows);
}

export async function lockHumanTransitionState(
  client: PoolClient,
  attemptId: string,
): Promise<HumanTransitionState> {
  const { attempt, databaseNow } = await lockAttempt(client, attemptId);
  const settlement = await lockSettlement(client, attemptId);
  const events = await readEvents(client, attemptId);
  const jobs = await readJobs(client, attemptId);
  return Object.freeze({ attempt, databaseNow, events, jobs, settlement });
}
