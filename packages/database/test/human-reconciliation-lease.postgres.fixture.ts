import { Client } from "pg";
import type { ReconciliationTestContext } from "./human-reconciliation.postgres.fixture.js";

export async function expireReconciliationLease(
  context: ReconciliationTestContext,
  attemptId: string,
): Promise<void> {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    await client.query(
      `UPDATE sotto.outbox_jobs
       SET lease_expires_at = clock_timestamp() - interval '1 microsecond'
       WHERE attempt_id = $1 AND kind = 'purchase-reconcile'`,
      [attemptId],
    );
  } finally {
    await client.end();
  }
}

export async function reconciliationJobState(
  context: ReconciliationTestContext,
  attemptId: string,
) {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{
      availableAt: Date;
      generation: string;
      owner: string | null;
      state: string;
    }>(
      `SELECT available_at AS "availableAt",
        lease_generation::text AS generation, lease_owner AS owner, state
       FROM sotto.outbox_jobs
       WHERE attempt_id = $1 AND kind = 'purchase-reconcile'`,
      [attemptId],
    );
    if (result.rows.length !== 1) throw new Error("test job is absent");
    return result.rows[0]!;
  } finally {
    await client.end();
  }
}

export async function reconciliationDatabaseTime(
  context: ReconciliationTestContext,
): Promise<string> {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ now: Date }>(
      'SELECT clock_timestamp() AS "now"',
    );
    return result.rows[0]!.now.toISOString();
  } finally {
    await client.end();
  }
}
