import { readAuthenticatedHumanSettlementExpectation } from "@sotto/x402-canton";
import type { Pool, PoolClient } from "pg";
import { sha256 } from "./publication-validation-primitives.js";
import { lockHumanTransitionState } from "./purchase-human-transition-row.js";
import { validateHumanTransitionState } from "./purchase-human-state-oracle.js";
import {
  reconciliationClaimInput,
  reconciliationLease,
} from "./purchase-reconcile-validation.js";
import type { HumanReconciliationClaimResult } from "./purchase-reconciliation-types.js";
import { readStoredSettlementAuthority } from "./purchase-settlement-row.js";
import { purchaseTransaction } from "./purchase-transaction.js";
import { PurchasePersistenceError } from "./purchase-types.js";

function offset(value: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new PurchasePersistenceError();
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new PurchasePersistenceError();
  }
  return parsed;
}

async function candidate(
  client: PoolClient,
  attemptId?: string,
): Promise<{ attemptId: string; jobId: string } | null> {
  const result = await client.query<{ attemptId: string; jobId: string }>(
    `WITH queue AS MATERIALIZED (
       SELECT job_id, attempt_id, available_at, created_at
       FROM sotto.outbox_jobs
       WHERE kind = 'purchase-reconcile' AND state = 'ready'
         AND event_sequence = 5
         AND available_at <= transaction_timestamp()
       UNION ALL
       SELECT job_id, attempt_id, available_at, created_at
       FROM sotto.outbox_jobs
       WHERE kind = 'purchase-reconcile' AND state = 'leased'
         AND event_sequence = 5
         AND available_at <= transaction_timestamp()
         AND lease_expires_at <= transaction_timestamp()
     )
     SELECT queue.attempt_id AS "attemptId", queue.job_id::text AS "jobId"
     FROM queue
     JOIN sotto.purchase_attempts attempt
       ON attempt.attempt_id = queue.attempt_id
     JOIN sotto.settlements settlement
       ON settlement.attempt_id = attempt.attempt_id
     WHERE attempt.state = 'execution-started'
       AND settlement.state = 'execution-started'
       AND settlement.command_id = attempt.command_id
       AND settlement.submission_id = attempt.submission_id
       AND settlement.execution_user_id = attempt.execution_user_id
       AND settlement.execution_started_at = attempt.execution_started_at
       AND ($1::text IS NULL OR queue.attempt_id = $1)
     ORDER BY queue.available_at, queue.created_at, queue.job_id
     FOR UPDATE OF attempt SKIP LOCKED
     LIMIT 1`,
    [attemptId ?? null],
  );
  if (result.rows.length === 0) return null;
  if (result.rows.length !== 1) throw new PurchasePersistenceError();
  return result.rows[0]!;
}

async function claim(
  client: PoolClient,
  input: ReturnType<typeof reconciliationClaimInput>,
): Promise<HumanReconciliationClaimResult | null> {
  const selected = await candidate(client, input.attemptId);
  if (selected === null) return null;
  const before = await lockHumanTransitionState(client, selected.attemptId);
  await validateHumanTransitionState(client, before);
  if (before.jobs[0]?.jobId !== selected.jobId) {
    throw new PurchasePersistenceError();
  }
  const update = await client.query<{
    attemptId: `sha256:${string}`;
    claimedAt: Date;
    jobId: string;
    leaseExpiresAt: Date;
    leaseGeneration: string;
    leaseOwner: string;
  }>(
    `UPDATE sotto.outbox_jobs
     SET state = 'leased', lease_generation = lease_generation + 1,
       lease_owner = $1, claimed_at = statement_timestamp(),
       lease_expires_at = statement_timestamp()
         + ($2::bigint * interval '1 millisecond')
     WHERE job_id = $3 AND attempt_id = $4
       AND kind = 'purchase-reconcile' AND event_sequence = 5
       AND available_at <= transaction_timestamp()
       AND (
         state = 'ready'
         OR (state = 'leased' AND lease_expires_at <= transaction_timestamp())
       )
     RETURNING job_id::text AS "jobId", attempt_id AS "attemptId",
       lease_generation::text AS "leaseGeneration",
       lease_owner AS "leaseOwner", claimed_at AS "claimedAt",
       lease_expires_at AS "leaseExpiresAt"`,
    [
      input.leaseOwner,
      input.leaseMilliseconds,
      selected.jobId,
      selected.attemptId,
    ],
  );
  if (update.rows.length !== 1) throw new PurchasePersistenceError();
  const after = await lockHumanTransitionState(client, selected.attemptId);
  await validateHumanTransitionState(client, after);
  const settlement = after.settlement;
  const authority = await readStoredSettlementAuthority(
    client,
    selected.attemptId,
  );
  if (
    settlement === null ||
    authority === null ||
    after.attempt.submissionId === null ||
    after.attempt.executionUserId === null
  ) {
    throw new PurchasePersistenceError();
  }
  const row = update.rows[0]!;
  const claimedJob = after.jobs[0];
  if (
    row.jobId !== selected.jobId ||
    row.attemptId !== selected.attemptId ||
    claimedJob === undefined ||
    claimedJob.jobId !== row.jobId ||
    claimedJob.leaseGeneration !== row.leaseGeneration ||
    claimedJob.leaseOwner !== row.leaseOwner
  ) {
    throw new PurchasePersistenceError();
  }
  const lease = reconciliationLease({
    jobId: row.jobId,
    attemptId: row.attemptId,
    leaseGeneration: Number(row.leaseGeneration),
    leaseOwner: row.leaseOwner,
    claimedAt: row.claimedAt.toISOString(),
    leaseExpiresAt: row.leaseExpiresAt.toISOString(),
  });
  const expectation = readAuthenticatedHumanSettlementExpectation(
    authority.expectation,
  );
  const active = await client.query<{ active: boolean }>(
    `SELECT clock_timestamp() < $1::timestamptz AS active`,
    [row.leaseExpiresAt],
  );
  if (active.rows.length !== 1 || active.rows[0]?.active !== true) {
    throw new PurchasePersistenceError();
  }
  const scope = Object.freeze({
    attemptId: sha256(after.attempt.attemptId, "reconciliation attempt ID"),
    beginExclusive: offset(after.attempt.beginExclusive),
    commandId: authority.commandId,
    executionUserId: after.attempt.executionUserId,
    reconciliationOffset: offset(settlement.reconciliationOffset),
    submissionId: after.attempt.submissionId,
    expectation,
  });
  return Object.freeze({ lease, scope });
}

export function claimHumanReconciliationLease(
  pool: Pool,
  candidateInput: unknown,
): Promise<HumanReconciliationClaimResult | null> {
  const input = reconciliationClaimInput(candidateInput);
  return purchaseTransaction(pool, (client) => claim(client, input));
}
