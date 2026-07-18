import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createPurchaseTestRuntime } from "./purchase-postgres.fixtures.js";
import { createExecutionStartedAttempt } from "./human-reconciliation.postgres.fixture.js";

let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_delivery_schema");
});

afterAll(async () => context?.database.drop());

it("installs the durable private payload, delivery claim, and response schema", async () => {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    const history = await client.query<{ name: string }>(
      "SELECT name FROM public.sotto_migrations ORDER BY id",
    );
    expect(history.rows.at(-1)).toEqual({ name: "0011_paid_delivery" });

    const tables = await client.query<{
      claims: string | null;
      payloads: string | null;
      responses: string | null;
    }>(`SELECT
      to_regclass('sotto.private_attempt_payloads')::text AS payloads,
      to_regclass('sotto.delivery_claims')::text AS claims,
      to_regclass('sotto.delivery_responses')::text AS responses`);
    expect(tables.rows).toEqual([
      {
        claims: "sotto.delivery_claims",
        payloads: "sotto.private_attempt_payloads",
        responses: "sotto.delivery_responses",
      },
    ]);
  } finally {
    await client.end();
  }
});

it("does not make identical application response hashes globally exclusive", async () => {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    const uniqueConstraints = await client.query<{ name: string }>(
      `SELECT constraint_name AS name
       FROM information_schema.table_constraints
       WHERE table_schema = 'sotto'
         AND table_name = 'delivery_responses'
         AND constraint_type = 'UNIQUE'
       ORDER BY constraint_name`,
    );
    expect(uniqueConstraints.rows).toEqual([
      { name: "delivery_responses_key_nonce_unique" },
    ]);
  } finally {
    await client.end();
  }
});

it("rejects delivery request nonce reuse under one encryption key", async () => {
  const first = await createExecutionStartedAttempt(context, 570);
  const second = await createExecutionStartedAttempt(context, 569);
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  const insert = (attemptId: string, requestCommitment: string) =>
    client.query(
      `INSERT INTO sotto.private_attempt_payloads
        (attempt_id, request_commitment, payload_schema, aead_algorithm,
         key_id, encryption_generation, nonce, authentication_tag, ciphertext)
       VALUES ($1, $2, 'sotto-private-delivery-request-v1', 'aes-256-gcm',
         'delivery-key-2026-07', 1, $3, $4, $5)`,
      [
        attemptId,
        requestCommitment,
        Buffer.alloc(12, 7),
        Buffer.alloc(16, 8),
        Buffer.from("{}"),
      ],
    );
  try {
    await insert(
      first.initialized.attemptId,
      first.initialized.requestCommitment,
    );
    await expect(
      insert(
        second.initialized.attemptId,
        second.initialized.requestCommitment,
      ),
    ).rejects.toMatchObject({ code: "23505" });
  } finally {
    await client.end();
    await first.purchase.close();
    await second.purchase.close();
  }
});

it("blocks migration rollback while private delivery material exists", async () => {
  const attempt = await createExecutionStartedAttempt(context, 566);
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO sotto.private_attempt_payloads
        (attempt_id, request_commitment, payload_schema, aead_algorithm,
         key_id, encryption_generation, nonce, authentication_tag, ciphertext)
       VALUES ($1, $2, 'sotto-private-delivery-request-v1', 'aes-256-gcm',
         'delivery-key-2026-07', 1, $3, $4, $5)`,
      [
        attempt.initialized.attemptId,
        attempt.initialized.requestCommitment,
        Buffer.from(attempt.initialized.attemptId.slice(7, 31), "hex"),
        Buffer.alloc(16, 6),
        Buffer.from("{}"),
      ],
    );
  } finally {
    await client.end();
    await attempt.purchase.close();
  }

  await expect(
    runner({
      databaseUrl: context.database.databaseUrl,
      dir: fileURLToPath(new URL("../migrations/", import.meta.url)),
      direction: "down",
      count: 1,
      migrationsTable: "sotto_migrations",
      migrationsSchema: "public",
      schema: "public",
      checkOrder: true,
      singleTransaction: true,
      noLock: false,
      log: () => undefined,
    }),
  ).rejects.toThrow(/delivery records must be archived/iu);
});
