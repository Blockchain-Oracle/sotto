import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createPostgresTestDatabase } from "./postgres-test-database.js";

type MigrationModule = Readonly<{
  applyDatabaseMigrationSet(input: {
    databaseUrl: string;
    directory: string;
    migrationsTable: string;
    migrationCount?: number;
  }): Promise<void>;
  applyDatabaseMigrations(input: { databaseUrl: string }): Promise<void>;
}>;

let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
let migrations: MigrationModule;

beforeAll(async () => {
  database = await createPostgresTestDatabase("sotto_catalog_upgrade_test");
  const migrationUrl = new URL("../dist/migrate.js", import.meta.url).href;
  migrations = (await import(
    /* @vite-ignore */ migrationUrl
  )) as MigrationModule;
});

afterAll(async () => database?.drop());

it("upgrades a populated production 0001 database through purchase journaling", async () => {
  await migrations.applyDatabaseMigrationSet({
    databaseUrl: database.databaseUrl,
    directory: fileURLToPath(new URL("../migrations/", import.meta.url)),
    migrationsTable: "sotto_migrations",
    migrationCount: 1,
  });

  const client = new Client({ connectionString: database.databaseUrl });
  await client.connect();
  try {
    await client.query(
      "INSERT INTO sotto.owners (id, party_id) VALUES ($1, $2)",
      ["018f3f24-7d4a-7e2c-a421-0f3473b94301", "sotto-existing::1220owner"],
    );
  } finally {
    await client.end();
  }

  await migrations.applyDatabaseMigrations({
    databaseUrl: database.databaseUrl,
  });
  await migrations.applyDatabaseMigrations({
    databaseUrl: database.databaseUrl,
  });

  const verified = new Client({ connectionString: database.databaseUrl });
  await verified.connect();
  try {
    const owner = await verified.query<{ partyId: string }>(
      'SELECT party_id AS "partyId" FROM sotto.owners',
    );
    expect(owner.rows).toEqual([{ partyId: "sotto-existing::1220owner" }]);
    const history = await verified.query<{ name: string }>(
      "SELECT name FROM public.sotto_migrations ORDER BY id",
    );
    expect(history.rows).toEqual([
      { name: "0001_catalog" },
      { name: "0002_provider_origins" },
      { name: "0003_resource_publication" },
      { name: "0004_resource_health" },
      { name: "0005_purchase_journal" },
      { name: "0006_private_prepare_authorities" },
      { name: "0007_prepare_job_leases" },
      { name: "0008_prepared_hash_checkpoint" },
      { name: "0009_human_execution_boundary" },
    ]);
  } finally {
    await verified.end();
  }
});
