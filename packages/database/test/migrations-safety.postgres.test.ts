import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { expect, it } from "vitest";

type ApplyMigrationSet = (input: {
  databaseUrl: string;
  directory: string;
  migrationsTable: string;
}) => Promise<void>;

const fixtureDirectory = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}/`, import.meta.url));

async function migrationRunner(): Promise<ApplyMigrationSet> {
  const moduleUrl = new URL("../dist/migrate.js", import.meta.url).href;
  const { applyDatabaseMigrationSet } = (await import(
    /* @vite-ignore */ moduleUrl
  )) as { applyDatabaseMigrationSet: ApplyMigrationSet };
  return applyDatabaseMigrationSet;
}

it("rolls back every schema effect when a migration fails", async () => {
  const databaseUrl = process.env.SOTTO_TEST_DATABASE_URL ?? "";
  const applyMigrationSet = await migrationRunner();

  await expect(
    applyMigrationSet({
      databaseUrl,
      directory: fixtureDirectory("rollback-migrations"),
      migrationsTable: "sotto_rollback_migrations",
    }),
  ).rejects.toThrow(/division by zero/iu);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const state = await client.query<{
      history: string | null;
      probe: string | null;
    }>(`
      SELECT
        to_regclass('public.sotto_rollback_migrations')::text AS history,
        to_regclass('public.sotto_migration_rollback_probe')::text AS probe
    `);
    expect(state.rows).toEqual([
      { history: "sotto_rollback_migrations", probe: null },
    ]);
    const history = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.sotto_rollback_migrations",
    );
    expect(history.rows).toEqual([{ count: "0" }]);
  } finally {
    await client.end();
  }
});

it("upgrades a populated prior schema without replaying history", async () => {
  const databaseUrl = process.env.SOTTO_TEST_DATABASE_URL ?? "";
  const applyMigrationSet = await migrationRunner();
  const base = {
    databaseUrl,
    migrationsTable: "sotto_upgrade_migrations",
  };
  await applyMigrationSet({
    ...base,
    directory: fixtureDirectory("upgrade-v1-migrations"),
  });

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      "INSERT INTO public.sotto_migration_upgrade_probe (id) VALUES ($1)",
      ["018f3f24-7d4a-7e2c-a421-0f3473b942c2"],
    );
  } finally {
    await client.end();
  }

  await applyMigrationSet({
    ...base,
    directory: fixtureDirectory("upgrade-v2-migrations"),
  });

  const verified = new Client({ connectionString: databaseUrl });
  await verified.connect();
  try {
    const row = await verified.query<{ label: string }>(
      "SELECT label FROM public.sotto_migration_upgrade_probe",
    );
    expect(row.rows).toEqual([{ label: "legacy" }]);
    const history = await verified.query<{ name: string }>(
      "SELECT name FROM public.sotto_upgrade_migrations ORDER BY id",
    );
    expect(history.rows).toEqual([
      { name: "0001_base" },
      { name: "0002_label" },
    ]);
  } finally {
    await verified.end();
  }
});
