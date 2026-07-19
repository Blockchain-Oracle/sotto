import type { Pool } from "pg";

export type AttemptWindowCounts = Readonly<{
  attempts: number;
  executed: number;
  settled: number;
  settlementRejected: number;
  delivered: number;
  deliveryFailed: number;
}>;

export type ProbeWindowCounts = Readonly<{
  observations: number;
  healthy: number;
  degraded: number;
  failing: number;
}>;

export type WorkerHeartbeatFacts = Readonly<{
  workerId: string;
  kind: string;
  sourceCommit: string;
  beatAt: string;
}> | null;

export type StatsReads = Readonly<{
  attemptCounts(sinceIso: string | null): Promise<AttemptWindowCounts>;
  probeCounts(sinceIso: string | null): Promise<ProbeWindowCounts>;
  latestWorkerHeartbeat(): Promise<WorkerHeartbeatFacts>;
  ping(): Promise<boolean>;
}>;

export function createStatsReads(pool: Pool): StatsReads {
  return Object.freeze({
    attemptCounts: async (sinceIso) => {
      const result = await pool.query<{
        attempts: string;
        executed: string;
        settled: string;
        settlementRejected: string;
        delivered: string;
        deliveryFailed: string;
      }>(
        `SELECT
           count(*)::text AS "attempts",
           count(*) FILTER (WHERE attempt.state IN
             ('execution-started', 'settlement-reconciled',
              'settlement-rejected'))::text AS "executed",
           count(*) FILTER (WHERE attempt.state = 'settlement-reconciled')::text
             AS "settled",
           count(*) FILTER (WHERE attempt.state = 'settlement-rejected')::text
             AS "settlementRejected",
           count(response.delivery_id)::text AS "delivered",
           count(claim.delivery_id) FILTER
             (WHERE claim.failure_code IS NOT NULL)::text AS "deliveryFailed"
         FROM sotto.purchase_attempts attempt
         LEFT JOIN sotto.delivery_claims claim
           ON claim.attempt_id = attempt.attempt_id
         LEFT JOIN sotto.delivery_responses response
           ON response.delivery_id = claim.delivery_id
         WHERE $1::timestamptz IS NULL OR attempt.created_at >= $1`,
        [sinceIso],
      );
      const row = result.rows[0];
      if (row === undefined) throw new Error("stats attempt read failed");
      return Object.freeze({
        attempts: Number(row.attempts),
        executed: Number(row.executed),
        settled: Number(row.settled),
        settlementRejected: Number(row.settlementRejected),
        delivered: Number(row.delivered),
        deliveryFailed: Number(row.deliveryFailed),
      });
    },
    probeCounts: async (sinceIso) => {
      const result = await pool.query<{
        observations: string;
        healthy: string;
        degraded: string;
        failing: string;
      }>(
        `SELECT
           count(*)::text AS "observations",
           count(*) FILTER (WHERE status = 'healthy')::text AS "healthy",
           count(*) FILTER (WHERE status = 'degraded')::text AS "degraded",
           count(*) FILTER (WHERE status = 'failing')::text AS "failing"
         FROM sotto.health_observations
         WHERE $1::timestamptz IS NULL OR observed_at >= $1`,
        [sinceIso],
      );
      const row = result.rows[0];
      if (row === undefined) throw new Error("stats probe read failed");
      return Object.freeze({
        observations: Number(row.observations),
        healthy: Number(row.healthy),
        degraded: Number(row.degraded),
        failing: Number(row.failing),
      });
    },
    latestWorkerHeartbeat: async () => {
      const result = await pool.query<{
        workerId: string;
        kind: string;
        sourceCommit: string;
        beatAt: Date;
      }>(
        `SELECT worker_id AS "workerId", kind,
                source_commit AS "sourceCommit", beat_at AS "beatAt"
         FROM sotto.worker_heartbeats
         ORDER BY beat_at DESC LIMIT 1`,
      );
      const row = result.rows[0];
      if (row === undefined) return null;
      return Object.freeze({
        workerId: row.workerId,
        kind: row.kind,
        sourceCommit: row.sourceCommit,
        beatAt: row.beatAt.toISOString(),
      });
    },
    ping: async () => {
      try {
        await pool.query("SELECT 1");
        return true;
      } catch {
        return false;
      }
    },
  });
}
