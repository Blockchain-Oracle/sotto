import type { Pool } from "pg";
import { lockHumanTransitionState } from "./purchase-human-transition-row.js";
import { validateHumanTransitionState } from "./purchase-human-state-oracle.js";
import { reconciliationDeferInput } from "./purchase-reconcile-validation.js";
import type { HumanReconciliationDeferResult } from "./purchase-reconciliation-types.js";
import { purchaseTransaction } from "./purchase-transaction.js";
import { PurchasePersistenceError } from "./purchase-types.js";

function exactLease(
  input: ReturnType<typeof reconciliationDeferInput>,
  state: Awaited<ReturnType<typeof lockHumanTransitionState>>,
): void {
  const job = state.jobs[0];
  if (
    job === undefined ||
    state.settlement === null ||
    state.attempt.attemptId !== input.lease.attemptId ||
    job.jobId !== input.lease.jobId ||
    job.state !== "leased" ||
    job.leaseGeneration !== String(input.lease.leaseGeneration) ||
    job.leaseOwner !== input.lease.leaseOwner ||
    job.claimedAt?.toISOString() !== input.lease.claimedAt ||
    job.leaseExpiresAt?.toISOString() !== input.lease.leaseExpiresAt ||
    job.leaseExpiresAt.getTime() <= state.databaseNow.getTime() ||
    state.settlement.reconciliationOffset !==
      String(input.expectedReconciliationOffset)
  ) {
    throw new PurchasePersistenceError();
  }
}

export function deferHumanReconciliationLease(
  pool: Pool,
  candidate: unknown,
): Promise<HumanReconciliationDeferResult> {
  const input = reconciliationDeferInput(candidate);
  return purchaseTransaction(pool, async (client) => {
    const state = await lockHumanTransitionState(client, input.lease.attemptId);
    await validateHumanTransitionState(client, state);
    exactLease(input, state);
    const settlement = await client.query(
      `UPDATE sotto.settlements
       SET reconciliation_offset = $2
       WHERE attempt_id = $1 AND state = 'execution-started'
         AND reconciliation_offset = $3`,
      [
        input.lease.attemptId,
        input.scannedThroughOffset,
        input.expectedReconciliationOffset,
      ],
    );
    const job = await client.query<{
      availableAt: Date;
      jobId: string;
      leaseGeneration: string;
    }>(
      `UPDATE sotto.outbox_jobs
       SET state = 'ready',
         available_at = statement_timestamp()
           + ($5::bigint * interval '1 millisecond'),
         lease_owner = NULL, lease_expires_at = NULL, claimed_at = NULL
       WHERE job_id = $1 AND attempt_id = $2
         AND kind = 'purchase-reconcile' AND event_sequence = 5
         AND state = 'leased' AND lease_generation = $3
         AND lease_owner = $4 AND claimed_at IS NOT NULL
         AND lease_expires_at > clock_timestamp()
         AND result_event_sequence IS NULL AND completed_at IS NULL
       RETURNING job_id::text AS "jobId",
         lease_generation::text AS "leaseGeneration",
         available_at AS "availableAt"`,
      [
        input.lease.jobId,
        input.lease.attemptId,
        input.lease.leaseGeneration,
        input.lease.leaseOwner,
        input.backoffMilliseconds,
      ],
    );
    if (settlement.rowCount !== 1 || job.rows.length !== 1) {
      throw new PurchasePersistenceError();
    }
    const after = await lockHumanTransitionState(client, input.lease.attemptId);
    await validateHumanTransitionState(client, after);
    const row = job.rows[0]!;
    return Object.freeze({
      outcome: "requeued" as const,
      attemptId: input.lease.attemptId,
      reconciliationOffset: input.scannedThroughOffset,
      job: Object.freeze({
        jobId: row.jobId,
        state: "ready" as const,
        leaseGeneration: Number(row.leaseGeneration),
        availableAt: row.availableAt.toISOString(),
      }),
    });
  });
}
