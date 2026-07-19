import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createPurchaseTestRuntime } from "./purchase-postgres.fixtures.js";
import { OWNER_ID, REVISION_ID } from "./publication.fixtures.js";

let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_prepare_job_fk_test");
});

afterAll(async () => context?.database.drop());

it("requires an encrypted authority before accepting a prepare job", async () => {
  const attemptId = `sha256:${"a".repeat(64)}`;
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO sotto.purchase_attempts
        (attempt_id, operation_id, request_hash, owner_id,
         resource_revision_id, authorization_mode, commitment_version,
         request_commitment, challenge_id, purchase_commitment,
         begin_exclusive, execute_before, source_commit)
       VALUES ($1, $2, $3, $4, $5, 'human-wallet',
         'sotto-human-purchase-v1', $6, $7, $8, 0,
         clock_timestamp() + interval '10 minutes', $9)`,
      [
        attemptId,
        `sha256:${"b".repeat(64)}`,
        "c".repeat(64),
        OWNER_ID,
        REVISION_ID,
        `sha256:${"d".repeat(64)}`,
        `sha256:${"e".repeat(64)}`,
        `sha256:${"f".repeat(64)}`,
        "1".repeat(40),
      ],
    );
    await client.query(
      `INSERT INTO sotto.attempt_events
        (attempt_id, sequence, event_type, event_hash)
       VALUES ($1, 1, 'intent-created', $2)`,
      [attemptId, `sha256:${"2".repeat(64)}`],
    );
    const insertJob = () =>
      client.query(
        `INSERT INTO sotto.outbox_jobs
          (job_id, dedupe_key, attempt_id, event_sequence, kind)
         VALUES ($1, $2, $3, 1, 'purchase-prepare')`,
        [
          "018f3f24-7d4a-7e2c-a421-0f3473b94397",
          `sha256:${"3".repeat(64)}`,
          attemptId,
        ],
      );
    await expect(insertJob()).rejects.toMatchObject({
      code: "23503",
      constraint: "outbox_jobs_prepare_authority_fk",
    });

    await client.query(
      `INSERT INTO sotto.private_prepare_authorities
        (attempt_id, authority_schema, aead_algorithm, key_id,
         encryption_generation, nonce, authentication_tag, ciphertext)
       VALUES ($1, 'sotto-private-prepare-authority-v1', 'aes-256-gcm',
         'prepare-key-2026-07', 1, $2, $3, $4)`,
      [attemptId, Buffer.alloc(12, 1), Buffer.alloc(16, 2), Buffer.from([3])],
    );
    await expect(insertJob()).resolves.toMatchObject({ rowCount: 1 });
  } finally {
    await client.end();
  }
});
