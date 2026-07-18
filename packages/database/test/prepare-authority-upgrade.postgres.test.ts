import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createPostgresTestDatabase } from "./postgres-test-database.js";
import {
  originRegistration,
  OWNER_ID,
  REVISION_ID,
  verifiedProbe,
} from "./publication.fixtures.js";

type Migrations = Readonly<{
  applyDatabaseMigrationSet(input: {
    databaseUrl: string;
    directory: string;
    migrationsTable: string;
    migrationCount?: number;
  }): Promise<void>;
  applyDatabaseMigrations(input: { databaseUrl: string }): Promise<void>;
}>;

type Runtime = Readonly<{
  createCatalogRepository(input: { databaseUrl: string }): {
    registerProviderOrigin(input: typeof originRegistration): Promise<unknown>;
    recordProbeObservation(input: typeof verifiedProbe): Promise<unknown>;
    close(): Promise<void>;
  };
}>;

let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
let migrations: Migrations;
let runtime: Runtime;

beforeAll(async () => {
  database = await createPostgresTestDatabase("sotto_prepare_upgrade_test");
  runtime = (await import(
    /* @vite-ignore */ new URL("../dist/index.js", import.meta.url).href
  )) as Runtime;
  migrations = (await import(
    /* @vite-ignore */ new URL("../dist/migrate.js", import.meta.url).href
  )) as Migrations;
});

afterAll(async () => database?.drop());

it("fails closed when a 0005 database has a ready legacy prepare job", async () => {
  await migrations.applyDatabaseMigrationSet({
    databaseUrl: database.databaseUrl,
    directory: fileURLToPath(new URL("../migrations/", import.meta.url)),
    migrationsTable: "sotto_migrations",
    migrationCount: 5,
  });
  const catalog = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  await catalog.registerProviderOrigin(originRegistration);
  await catalog.recordProbeObservation(verifiedProbe);
  await catalog.close();

  const client = new Client({ connectionString: database.databaseUrl });
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
        `sha256:${"a".repeat(64)}`,
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
      [`sha256:${"a".repeat(64)}`, `sha256:${"1".repeat(64)}`],
    );
    await client.query(
      `INSERT INTO sotto.outbox_jobs
        (job_id, dedupe_key, attempt_id, event_sequence, kind)
       VALUES ($1, $2, $3, 1, 'purchase-prepare')`,
      [
        "018f3f24-7d4a-7e2c-a421-0f3473b94399",
        `sha256:${"2".repeat(64)}`,
        `sha256:${"a".repeat(64)}`,
      ],
    );

    await expect(
      migrations.applyDatabaseMigrations({ databaseUrl: database.databaseUrl }),
    ).rejects.toThrow(/legacy.*prepare.*job/iu);
    await expect(
      client.query("SELECT 1 FROM sotto.private_prepare_authorities"),
    ).rejects.toThrow(/does not exist/iu);

    await client.query("DELETE FROM sotto.outbox_jobs");
    await migrations.applyDatabaseMigrations({
      databaseUrl: database.databaseUrl,
    });
    const authorityTable = await client.query<{ tableName: string | null }>(
      `SELECT to_regclass('sotto.private_prepare_authorities')::text
        AS "tableName"`,
    );
    expect(authorityTable.rows).toEqual([
      { tableName: "sotto.private_prepare_authorities" },
    ]);
  } finally {
    await client.end();
  }
});
