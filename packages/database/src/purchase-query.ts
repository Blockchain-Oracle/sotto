import type { PoolClient } from "pg";
import {
  PurchaseConflictError,
  PurchasePersistenceError,
  type HumanPurchaseAttemptResult,
} from "./purchase-types.js";
import { uuid } from "./publication-validation-primitives.js";
import type { ValidatedHumanPurchaseAttempt } from "./purchase-validation.js";

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
  job.created_at AS "jobCreatedAt"
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

function timestamp(value: unknown): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new PurchasePersistenceError();
  }
  return value.toISOString();
}

function exactStoredIdentity(
  row: PurchaseAggregateRow,
  expected: ValidatedHumanPurchaseAttempt,
): void {
  const identities = [
    [row.attemptId, expected.attemptId],
    [row.operationId, expected.operationId],
    [row.requestHash, expected.requestHash],
    [row.ownerId, expected.ownerId],
    [row.resourceRevisionId, expected.resourceRevisionId],
    [row.authorizationMode, expected.authorizationMode],
    [row.commitmentVersion, expected.commitmentVersion],
    [row.requestCommitment, expected.requestCommitment],
    [row.challengeId, expected.challengeId],
    [row.purchaseCommitment, expected.purchaseCommitment],
    [row.commandId, expected.commandId],
    [row.beginExclusive, String(expected.beginExclusive)],
    [timestamp(row.executeBefore), expected.executeBefore],
    [row.sourceCommit, expected.sourceCommit],
    [row.state, expected.state],
    [row.eventSequence, String(expected.eventSequence)],
    [row.eventType, expected.eventType],
    [row.eventHash, expected.eventHash],
    [row.previousEventHash, null],
    [row.jobDedupeKey, expected.jobDedupeKey],
    [row.jobKind, expected.jobKind],
    [row.jobState, expected.jobState],
  ];
  if (identities.some(([actual, wanted]) => actual !== wanted)) {
    throw row.requestHash === expected.requestHash
      ? new PurchasePersistenceError()
      : new PurchaseConflictError();
  }
}

export function purchaseAggregateResult(
  row: PurchaseAggregateRow,
  expected: ValidatedHumanPurchaseAttempt,
  outcome: "created" | "replayed",
): HumanPurchaseAttemptResult {
  exactStoredIdentity(row, expected);
  if (
    row.jobId === null ||
    row.eventRecordedAt === null ||
    row.jobAvailableAt === null ||
    row.jobCreatedAt === null
  ) {
    throw new PurchasePersistenceError();
  }
  return Object.freeze({
    outcome,
    operationId: expected.operationId,
    attemptId: expected.attemptId,
    ownerId: expected.ownerId,
    resourceRevisionId: expected.resourceRevisionId,
    authorizationMode: expected.authorizationMode,
    commitmentVersion: expected.commitmentVersion,
    requestCommitment: expected.requestCommitment,
    challengeId: expected.challengeId,
    purchaseCommitment: expected.purchaseCommitment,
    commandId: expected.commandId,
    beginExclusive: expected.beginExclusive,
    executeBefore: expected.executeBefore,
    sourceCommit: expected.sourceCommit,
    state: expected.state,
    createdAt: timestamp(row.createdAt),
    event: Object.freeze({
      sequence: expected.eventSequence,
      type: expected.eventType,
      eventHash: expected.eventHash,
      previousEventHash: null,
      recordedAt: timestamp(row.eventRecordedAt),
    }),
    job: Object.freeze({
      jobId: uuid(row.jobId, "stored purchase job ID"),
      dedupeKey: expected.jobDedupeKey,
      kind: expected.jobKind,
      state: expected.jobState,
      availableAt: timestamp(row.jobAvailableAt),
      createdAt: timestamp(row.jobCreatedAt),
    }),
  });
}
