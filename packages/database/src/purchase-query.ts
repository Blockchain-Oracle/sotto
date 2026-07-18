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
  eventSequence: string | null;
  eventType: string | null;
  eventHash: string | null;
  previousEventHash: string | null;
  eventRecordedAt: Date | null;
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
  event.sequence::text AS "eventSequence",
  event.event_type AS "eventType",
  event.event_hash AS "eventHash",
  event.previous_event_hash AS "previousEventHash",
  event.recorded_at AS "eventRecordedAt",
  job.job_id::text AS "jobId",
  job.dedupe_key AS "jobDedupeKey",
  job.kind AS "jobKind",
  job.state AS "jobState",
  job.available_at AS "jobAvailableAt",
  job.created_at AS "jobCreatedAt",
  job.lease_generation::text AS "jobLeaseGeneration",
  job.lease_owner AS "jobLeaseOwner",
  job.lease_expires_at AS "jobLeaseExpiresAt",
  job.claimed_at AS "jobClaimedAt"
FROM sotto.purchase_attempts attempt
LEFT JOIN sotto.attempt_events event
  ON event.attempt_id = attempt.attempt_id AND event.sequence = 1
LEFT JOIN sotto.outbox_jobs job
  ON job.attempt_id = event.attempt_id
 AND job.event_sequence = event.sequence
 AND job.kind = 'purchase-prepare'`;

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
