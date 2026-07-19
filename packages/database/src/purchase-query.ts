import type { PoolClient } from "pg";
import { PurchasePersistenceError } from "./purchase-types.js";

export type PurchaseAggregateRow = Readonly<{
  attemptId: string;
  operationId: string;
  requestHash: string;
  ownerId: string;
  resourceRevisionId: string;
  authorizationMode: string;
  commitmentVersion: string;
  requestCommitment: string;
  challengeId: string;
  purchaseCommitment: string;
  commandId: string;
  beginExclusive: string;
  executeBefore: Date;
  sourceCommit: string;
  state: string;
  createdAt: Date;
  preparedTransactionHash: string | null;
  transferContextHash: string | null;
  preparedVerifiedAt: Date | null;
  eventSequence: string | null;
  eventType: string | null;
  eventHash: string | null;
  previousEventHash: string | null;
  eventRecordedAt: Date | null;
  resultEventSequence: string | null;
  resultEventType: string | null;
  resultEventHash: string | null;
  resultPreviousEventHash: string | null;
  resultPreparedTransactionHash: string | null;
  resultTransferContextHash: string | null;
  resultPreparedVerifiedAt: Date | null;
  resultEventRecordedAt: Date | null;
  jobId: string | null;
  jobDedupeKey: string | null;
  jobKind: string | null;
  jobState: string | null;
  jobAvailableAt: Date | null;
  jobCreatedAt: Date | null;
  jobLeaseGeneration: string | null;
  jobLeaseOwner: string | null;
  jobLeaseExpiresAt: Date | null;
  jobClaimedAt: Date | null;
  jobResultEventSequence: string | null;
  jobCompletedAt: Date | null;
  authorityAttemptId: string | null;
  authorityRetiredAt: Date | null;
}>;

const AGGREGATE_SELECT = `SELECT
  attempt.attempt_id AS "attemptId",
  attempt.operation_id AS "operationId",
  attempt.request_hash AS "requestHash",
  attempt.owner_id::text AS "ownerId",
  attempt.resource_revision_id::text AS "resourceRevisionId",
  attempt.authorization_mode AS "authorizationMode",
  attempt.commitment_version AS "commitmentVersion",
  attempt.request_commitment AS "requestCommitment",
  attempt.challenge_id AS "challengeId",
  attempt.purchase_commitment AS "purchaseCommitment",
  attempt.command_id AS "commandId",
  attempt.begin_exclusive::text AS "beginExclusive",
  attempt.execute_before AS "executeBefore",
  attempt.source_commit AS "sourceCommit",
  attempt.state,
  attempt.created_at AS "createdAt",
  attempt.prepared_transaction_hash AS "preparedTransactionHash",
  attempt.transfer_context_hash AS "transferContextHash",
  attempt.prepared_verified_at AS "preparedVerifiedAt",
  event.sequence::text AS "eventSequence",
  event.event_type AS "eventType",
  event.event_hash AS "eventHash",
  event.previous_event_hash AS "previousEventHash",
  event.recorded_at AS "eventRecordedAt",
  result_event.sequence::text AS "resultEventSequence",
  result_event.event_type AS "resultEventType",
  result_event.event_hash AS "resultEventHash",
  result_event.previous_event_hash AS "resultPreviousEventHash",
  result_event.prepared_transaction_hash AS "resultPreparedTransactionHash",
  result_event.transfer_context_hash AS "resultTransferContextHash",
  result_event.prepared_verified_at AS "resultPreparedVerifiedAt",
  result_event.recorded_at AS "resultEventRecordedAt",
  job.job_id::text AS "jobId",
  job.dedupe_key AS "jobDedupeKey",
  job.kind AS "jobKind",
  job.state AS "jobState",
  job.available_at AS "jobAvailableAt",
  job.created_at AS "jobCreatedAt",
  job.lease_generation::text AS "jobLeaseGeneration",
  job.lease_owner AS "jobLeaseOwner",
  job.lease_expires_at AS "jobLeaseExpiresAt",
  job.claimed_at AS "jobClaimedAt",
  job.result_event_sequence::text AS "jobResultEventSequence",
  job.completed_at AS "jobCompletedAt",
  authority.attempt_id AS "authorityAttemptId",
  authority.retired_at AS "authorityRetiredAt"
FROM sotto.purchase_attempts attempt
LEFT JOIN sotto.attempt_events event
  ON event.attempt_id = attempt.attempt_id AND event.sequence = 1
LEFT JOIN sotto.attempt_events result_event
  ON result_event.attempt_id = attempt.attempt_id
 AND result_event.sequence = 2
LEFT JOIN sotto.outbox_jobs job
  ON job.attempt_id = event.attempt_id
 AND job.event_sequence = event.sequence
 AND job.kind = 'purchase-prepare'
LEFT JOIN sotto.private_prepare_authorities authority
  ON authority.attempt_id = attempt.attempt_id`;

export async function findPurchaseAggregate(
  client: PoolClient,
  operationId: string,
): Promise<PurchaseAggregateRow | undefined> {
  const result = await client.query<PurchaseAggregateRow>(
    `${AGGREGATE_SELECT} WHERE attempt.operation_id = $1`,
    [operationId],
  );
  if (result.rows.length > 1) throw new PurchasePersistenceError();
  return result.rows[0];
}

export async function listPurchaseAggregates(
  client: PoolClient,
  input: Readonly<{ ownerId: string; limit: number; createdBefore?: Date }>,
): Promise<readonly PurchaseAggregateRow[]> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    throw new PurchasePersistenceError();
  }
  const values: unknown[] = [input.ownerId, input.limit];
  let filter = "attempt.owner_id::text = $1";
  if (input.createdBefore !== undefined) {
    values.push(input.createdBefore);
    filter += " AND attempt.created_at < $3";
  }
  const result = await client.query<PurchaseAggregateRow>(
    `${AGGREGATE_SELECT} WHERE ${filter}
     ORDER BY attempt.created_at DESC, attempt.attempt_id
     LIMIT $2`,
    values,
  );
  return Object.freeze(result.rows);
}

export async function findPurchaseAggregateByAttemptId(
  client: PoolClient,
  attemptId: string,
): Promise<PurchaseAggregateRow | undefined> {
  const result = await client.query<PurchaseAggregateRow>(
    `${AGGREGATE_SELECT} WHERE attempt.attempt_id = $1`,
    [attemptId],
  );
  if (result.rows.length > 1) throw new PurchasePersistenceError();
  return result.rows[0];
}
