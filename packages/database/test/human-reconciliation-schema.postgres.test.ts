import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createPurchaseTestRuntime } from "./purchase-postgres.fixtures.js";
import {
  createExecutionStartedAttempt,
  readReconciliationEventHash,
  readReconciliationOffset,
  RECONCILIATION_UPDATE_ID,
  rollbackLatestReconciliationMigration,
  setReconciliationOffset,
  type ReconciliationTestContext,
} from "./human-reconciliation.postgres.fixture.js";

let context: ReconciliationTestContext;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_reconciliation_schema");
});

afterAll(async () => context?.database.drop());

it("installs the exact terminal reconciliation schema and indexes", async () => {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    const history = await client.query<{ name: string }>(
      "SELECT name FROM public.sotto_migrations ORDER BY id",
    );
    expect(history.rows.at(-1)).toEqual({
      name: "0010_human_reconciliation",
    });
    const columns = await client.query<{ columnName: string }>(
      `SELECT column_name AS "columnName" FROM information_schema.columns
       WHERE table_schema = 'sotto' AND table_name = 'settlements'
       ORDER BY column_name`,
    );
    expect(columns.rows.map(({ columnName }) => columnName)).toEqual(
      expect.arrayContaining([
        "completion_offset",
        "reconciled_at",
        "reconciliation_offset",
        "rejection_status_code",
        "update_id",
      ]),
    );
    const constraints = await client.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
       WHERE conrelid IN ('sotto.purchase_attempts'::regclass,
         'sotto.attempt_events'::regclass, 'sotto.outbox_jobs'::regclass,
         'sotto.settlements'::regclass)`,
    );
    const definitions = constraints.rows
      .map(({ definition }) => definition)
      .join("\n");
    expect(definitions).toContain("settlement-reconciled");
    expect(definitions).toContain("settlement-rejected");
    expect(definitions).toContain("result_event_sequence = 6");
    expect(definitions).toContain("kind = 'purchase-reconcile'");
    const indexes = await client.query<{ indexName: string }>(
      `SELECT indexname AS "indexName" FROM pg_indexes
       WHERE schemaname = 'sotto' AND tablename = 'outbox_jobs'`,
    );
    expect(indexes.rows.map(({ indexName }) => indexName)).toEqual(
      expect.arrayContaining([
        "outbox_jobs_reconcile_ready_idx",
        "outbox_jobs_reconcile_expired_idx",
      ]),
    );
  } finally {
    await client.end();
  }
});

it("accepts the exact leased reconcile job in lifecycle reads", async () => {
  const attempt = await createExecutionStartedAttempt(context, 580);
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    await client.query(
      `UPDATE sotto.outbox_jobs SET state = 'leased', lease_generation = 1,
         lease_owner = 'schema-worker', claimed_at = transaction_timestamp(),
         lease_expires_at = transaction_timestamp() + interval '30 seconds'
       WHERE attempt_id = $1 AND kind = 'purchase-reconcile'`,
      [attempt.initialized.attemptId],
    );
    await expect(
      attempt.purchase.readHumanPurchaseLifecycle(
        attempt.initialized.attemptId,
      ),
    ).resolves.toMatchObject({ state: "execution-started" });
  } finally {
    await client.end();
    await attempt.purchase.close();
  }
});

it("initializes the durable cursor from the attempt and rejects invalid offsets", async () => {
  const attempt = await createExecutionStartedAttempt(context, 581);
  try {
    expect(
      await readReconciliationOffset(context, attempt.initialized.attemptId),
    ).toBe("42");
    await expect(
      setReconciliationOffset(context, attempt.initialized.attemptId, -1),
    ).rejects.toMatchObject({ code: "23514" });
  } finally {
    await attempt.purchase.close();
  }
});

it("stores one coherent terminal settlement event and completed job", async () => {
  const attempt = await createExecutionStartedAttempt(context, 579);
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    const previousEventHash = await readReconciliationEventHash(
      context,
      attempt.initialized.attemptId,
      5,
    );
    await client.query("BEGIN");
    const now = await client.query<{ now: Date }>(
      'SELECT transaction_timestamp() AS "now"',
    );
    const reconciledAt = now.rows[0]!.now.toISOString();
    await client.query(
      `UPDATE sotto.outbox_jobs SET state = 'leased', lease_generation = 1,
         lease_owner = 'schema-terminal', claimed_at = $2,
         lease_expires_at = $2::timestamptz + interval '30 seconds'
       WHERE attempt_id = $1 AND kind = 'purchase-reconcile'`,
      [attempt.initialized.attemptId, reconciledAt],
    );
    await client.query(
      `INSERT INTO sotto.attempt_events
        (attempt_id, sequence, event_type, event_hash, previous_event_hash,
         completion_offset, update_id, reconciled_at, recorded_at)
       VALUES ($1, 6, 'settlement-reconciled', $2, $3, 43, $4, $5, $5)`,
      [
        attempt.initialized.attemptId,
        `sha256:${"f".repeat(64)}`,
        previousEventHash,
        RECONCILIATION_UPDATE_ID,
        reconciledAt,
      ],
    );
    await client.query(
      `UPDATE sotto.purchase_attempts SET state = 'settlement-reconciled'
       WHERE attempt_id = $1`,
      [attempt.initialized.attemptId],
    );
    await client.query(
      `UPDATE sotto.settlements SET state = 'settlement-reconciled',
         reconciliation_offset = 42, completion_offset = 43,
         update_id = $2, reconciled_at = $3
       WHERE attempt_id = $1`,
      [attempt.initialized.attemptId, RECONCILIATION_UPDATE_ID, reconciledAt],
    );
    await client.query(
      `UPDATE sotto.outbox_jobs SET state = 'completed',
         result_event_sequence = 6, completed_at = $2
       WHERE attempt_id = $1 AND kind = 'purchase-reconcile'`,
      [attempt.initialized.attemptId, reconciledAt],
    );
    const stored = await client.query<{ jobState: string; state: string }>(
      `SELECT settlement.state, job.state AS "jobState"
       FROM sotto.settlements settlement JOIN sotto.outbox_jobs job
         ON job.attempt_id = settlement.attempt_id
       WHERE settlement.attempt_id = $1 AND job.kind = 'purchase-reconcile'`,
      [attempt.initialized.attemptId],
    );
    expect(stored.rows).toEqual([
      { jobState: "completed", state: "settlement-reconciled" },
    ]);
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
    await attempt.purchase.close();
  }
});

it("blocks rollback after the reconciliation cursor advances", async () => {
  const attempt = await createExecutionStartedAttempt(context, 578);
  try {
    await setReconciliationOffset(context, attempt.initialized.attemptId, 43);
  } finally {
    await attempt.purchase.close();
  }
  await expect(rollbackLatestReconciliationMigration(context)).rejects.toThrow(
    /reconciliation records must be archived/iu,
  );
});
