import { MIN_HUMAN_SIGNING_RESERVE_MS } from "@sotto/x402-canton/internal/human-prepare-authority-persistence";
import type { Pool } from "pg";
import { purchaseTransaction } from "./purchase-transaction.js";
import { PurchasePersistenceError } from "./purchase-types.js";

const OWNER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MIN_LEASE_MS = 1_000;
const MAX_LEASE_MS = 60_000;

export type HumanPrepareAuthorityLease = Readonly<{
  jobId: string;
  attemptId: `sha256:${string}`;
  leaseGeneration: number;
  leaseOwner: string;
  leaseExpiresAt: string;
  claimedAt: string;
}>;

function leaseOwner(value: unknown): string {
  if (typeof value !== "string" || !OWNER_PATTERN.test(value)) {
    throw new PurchasePersistenceError();
  }
  return value;
}

function leaseMilliseconds(value: unknown): number {
  const duration = value ?? 30_000;
  if (
    typeof duration !== "number" ||
    !Number.isInteger(duration) ||
    duration < MIN_LEASE_MS ||
    duration > MAX_LEASE_MS
  ) {
    throw new PurchasePersistenceError();
  }
  return duration;
}

export async function claimPurchasePrepareAuthorityLease(
  pool: Pool,
  input: Readonly<{
    leaseOwner: string;
    leaseMilliseconds?: number;
    attemptId?: `sha256:${string}`;
  }>,
): Promise<HumanPrepareAuthorityLease | null> {
  const owner = leaseOwner(input.leaseOwner);
  const duration = leaseMilliseconds(input.leaseMilliseconds);
  return purchaseTransaction(pool, async (client) => {
    const result = await client.query<{
      jobId: string;
      attemptId: `sha256:${string}`;
      leaseGeneration: string;
      leaseOwner: string;
      leaseExpiresAt: Date;
      claimedAt: Date;
    }>(
      `WITH candidate AS (
        SELECT job.job_id
        FROM sotto.outbox_jobs job
        JOIN sotto.purchase_attempts attempt
          ON attempt.attempt_id = job.attempt_id
        WHERE job.kind = 'purchase-prepare'
          AND job.available_at <= transaction_timestamp()
          AND ($4::text IS NULL OR job.attempt_id = $4)
          AND (
            job.state = 'ready'
            OR (
              job.state = 'leased'
              AND job.lease_expires_at <= transaction_timestamp()
            )
          )
          AND attempt.execute_before - clock_timestamp() >=
            (($2::bigint + $3::bigint) * interval '1 millisecond')
        ORDER BY job.available_at, job.created_at, job.job_id
        FOR UPDATE OF job SKIP LOCKED
        LIMIT 1
      )
      UPDATE sotto.outbox_jobs job
      SET state = 'leased',
        lease_generation = job.lease_generation + 1,
        lease_owner = $1,
        claimed_at = transaction_timestamp(),
        lease_expires_at =
          transaction_timestamp() + ($2::bigint * interval '1 millisecond')
      FROM candidate
      WHERE job.job_id = candidate.job_id
      RETURNING
        job.job_id::text AS "jobId",
        job.attempt_id AS "attemptId",
        job.lease_generation::text AS "leaseGeneration",
        job.lease_owner AS "leaseOwner",
        job.lease_expires_at AS "leaseExpiresAt",
        job.claimed_at AS "claimedAt"`,
      [owner, duration, MIN_HUMAN_SIGNING_RESERVE_MS, input.attemptId ?? null],
    );
    if (result.rows.length === 0) return null;
    if (result.rows.length !== 1) throw new PurchasePersistenceError();
    const row = result.rows[0]!;
    return Object.freeze({
      jobId: row.jobId,
      attemptId: row.attemptId,
      leaseGeneration: Number(row.leaseGeneration),
      leaseOwner: row.leaseOwner,
      leaseExpiresAt: row.leaseExpiresAt.toISOString(),
      claimedAt: row.claimedAt.toISOString(),
    });
  });
}
