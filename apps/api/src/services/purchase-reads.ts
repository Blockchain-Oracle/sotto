import type { Pool } from "pg";
import {
  findPurchaseAggregateByAttemptId,
  listPurchaseAggregates,
  type PurchaseAggregateRow,
} from "@sotto/database";

const ATTEMPT_ID = /^sha256:[0-9a-f]{64}$/u;

export type AttemptEvent = Readonly<{
  sequence: number;
  type: string;
  recordedAt: string;
  updateId: string | null;
}>;

export type SettlementFacts = Readonly<{
  state: string;
  updateId: string | null;
  submissionId: string | null;
  executionStartedAt: string | null;
}>;

export type DeliveryFacts = Readonly<{
  claimState: string;
  failureCode: string | null;
  responseStatus: number | null;
  bodyByteCount: number | null;
  bodySha256: string | null;
  respondedAt: string | null;
}>;

export type PublicAttemptRow = Readonly<{
  attemptId: string;
  state: string;
  createdAt: string;
  executeBefore: string;
  method: string;
  routeTemplate: string;
  normalizedOrigin: string;
  resourceName: string;
  amountAtomic: string;
  asset: string;
}>;

export type PurchaseReads = Readonly<{
  listForOwner(
    ownerId: string,
    limit: number,
  ): Promise<readonly PurchaseAggregateRow[]>;
  aggregateByAttemptId(attemptId: string): Promise<PurchaseAggregateRow | null>;
  eventsSince(
    attemptId: string,
    afterSequence: number,
  ): Promise<readonly AttemptEvent[]>;
  listPublicAttempts(limit: number): Promise<readonly PublicAttemptRow[]>;
  publicAttemptById(attemptId: string): Promise<PublicAttemptRow | null>;
  settlementFacts(attemptId: string): Promise<SettlementFacts | null>;
  deliveryFacts(attemptId: string): Promise<DeliveryFacts | null>;
}>;

export function isAttemptId(value: string): boolean {
  return ATTEMPT_ID.test(value);
}

const PUBLIC_ATTEMPT_SELECT = `SELECT attempt.attempt_id AS "attemptId",
       attempt.state,
       attempt.created_at AS "createdAt",
       attempt.execute_before AS "executeBefore",
       resource.http_method AS "method",
       resource.route_template AS "routeTemplate",
       origin.normalized_origin AS "normalizedOrigin",
       probe.resource_name AS "resourceName",
       probe.amount_atomic::text AS "amountAtomic",
       probe.asset
  FROM sotto.purchase_attempts attempt
  JOIN sotto.resource_revisions revision
    ON revision.revision_id = attempt.resource_revision_id
  JOIN sotto.probe_observations probe
    ON probe.observation_id = revision.observation_id
  JOIN sotto.resources resource ON resource.id = revision.resource_id
  JOIN sotto.origins origin ON origin.id = revision.origin_id`;

type PublicAttemptQueryRow = Omit<
  PublicAttemptRow,
  "createdAt" | "executeBefore"
> &
  Readonly<{ createdAt: Date; executeBefore: Date }>;

function publicAttempt(row: PublicAttemptQueryRow): PublicAttemptRow {
  return Object.freeze({
    ...row,
    createdAt: row.createdAt.toISOString(),
    executeBefore: row.executeBefore.toISOString(),
  });
}

export function createPurchaseReads(pool: Pool): PurchaseReads {
  return Object.freeze({
    listForOwner: async (ownerId, limit) => {
      const client = await pool.connect();
      try {
        return await listPurchaseAggregates(client, { ownerId, limit });
      } finally {
        client.release();
      }
    },
    aggregateByAttemptId: async (attemptId) => {
      if (!isAttemptId(attemptId)) return null;
      const client = await pool.connect();
      try {
        return (
          (await findPurchaseAggregateByAttemptId(client, attemptId)) ?? null
        );
      } finally {
        client.release();
      }
    },
    eventsSince: async (attemptId, afterSequence) => {
      if (!isAttemptId(attemptId) || !Number.isSafeInteger(afterSequence)) {
        return Object.freeze([]);
      }
      const result = await pool.query<{
        sequence: string;
        type: string;
        recordedAt: Date;
        updateId: string | null;
      }>(
        `SELECT sequence::text AS "sequence", event_type AS "type",
                recorded_at AS "recordedAt", update_id AS "updateId"
         FROM sotto.attempt_events
         WHERE attempt_id = $1 AND sequence > $2
         ORDER BY sequence`,
        [attemptId, afterSequence],
      );
      return Object.freeze(
        result.rows.map((row) =>
          Object.freeze({
            sequence: Number(row.sequence),
            type: row.type,
            recordedAt: row.recordedAt.toISOString(),
            updateId: row.updateId,
          }),
        ),
      );
    },
    listPublicAttempts: async (limit) => {
      const bounded = Number.isSafeInteger(limit)
        ? Math.min(Math.max(limit, 1), 100)
        : 50;
      const result = await pool.query<PublicAttemptQueryRow>(
        `${PUBLIC_ATTEMPT_SELECT}
         ORDER BY attempt.created_at DESC, attempt.attempt_id
         LIMIT $1`,
        [bounded],
      );
      return Object.freeze(result.rows.map(publicAttempt));
    },
    publicAttemptById: async (attemptId) => {
      if (!isAttemptId(attemptId)) return null;
      const result = await pool.query<PublicAttemptQueryRow>(
        `${PUBLIC_ATTEMPT_SELECT} WHERE attempt.attempt_id = $1`,
        [attemptId],
      );
      const row = result.rows[0];
      return row === undefined ? null : publicAttempt(row);
    },
    settlementFacts: async (attemptId) => {
      if (!isAttemptId(attemptId)) return null;
      const result = await pool.query<{
        state: string;
        updateId: string | null;
        submissionId: string | null;
        executionStartedAt: Date | null;
      }>(
        `SELECT state, update_id AS "updateId",
                submission_id::text AS "submissionId",
                execution_started_at AS "executionStartedAt"
         FROM sotto.settlements WHERE attempt_id = $1`,
        [attemptId],
      );
      const row = result.rows[0];
      if (row === undefined) return null;
      return Object.freeze({
        state: row.state,
        updateId: row.updateId,
        submissionId: row.submissionId,
        executionStartedAt: row.executionStartedAt?.toISOString() ?? null,
      });
    },
    deliveryFacts: async (attemptId) => {
      if (!isAttemptId(attemptId)) return null;
      const result = await pool.query<{
        claimState: string;
        failureCode: string | null;
        responseStatus: number | null;
        bodyByteCount: number | null;
        bodySha256: string | null;
        respondedAt: Date | null;
      }>(
        `SELECT claim.state AS "claimState",
                claim.failure_code AS "failureCode",
                response.status AS "responseStatus",
                response.body_byte_count AS "bodyByteCount",
                response.body_sha256 AS "bodySha256",
                response.created_at AS "respondedAt"
         FROM sotto.delivery_claims claim
         LEFT JOIN sotto.delivery_responses response
           ON response.delivery_id = claim.delivery_id
         WHERE claim.attempt_id = $1`,
        [attemptId],
      );
      const row = result.rows[0];
      if (row === undefined) return null;
      return Object.freeze({
        claimState: row.claimState,
        failureCode: row.failureCode,
        responseStatus: row.responseStatus,
        bodyByteCount: row.bodyByteCount,
        bodySha256: row.bodySha256,
        respondedAt: row.respondedAt?.toISOString() ?? null,
      });
    },
  });
}
