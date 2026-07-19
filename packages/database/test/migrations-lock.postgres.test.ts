import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { PG_MIGRATE_LOCK_ID } from "node-pg-migrate";
import { Client } from "pg";
import { expect, it } from "vitest";

type ApplyMigrationSet = (input: {
  databaseUrl: string;
  directory: string;
  migrationsTable: string;
}) => Promise<void>;

const migrationsDirectory = fileURLToPath(
  new URL("./fixtures/lock-migrations/", import.meta.url),
);

async function waitForMigrationLock(client: Client): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await client.query<{ available: boolean }>(
      "SELECT pg_try_advisory_lock($1::bigint) AS available",
      [String(PG_MIGRATE_LOCK_ID)],
    );
    if (result.rows[0]?.available === false) return;
    await client.query("SELECT pg_advisory_unlock($1::bigint)", [
      String(PG_MIGRATE_LOCK_ID),
    ]);
    await delay(10);
  }
  throw new Error("migration runner did not acquire its advisory lock");
}

it("allows exactly one concurrent migration runner", async () => {
  const databaseUrl = process.env.SOTTO_TEST_DATABASE_URL ?? "";
  const migrationModule = new URL("../dist/migrate.js", import.meta.url).href;
  const { applyDatabaseMigrationSet } = (await import(
    /* @vite-ignore */ migrationModule
  )) as { applyDatabaseMigrationSet?: ApplyMigrationSet };
  expect(typeof applyDatabaseMigrationSet).toBe("function");
  if (applyDatabaseMigrationSet === undefined) return;

  const input = {
    databaseUrl,
    directory: migrationsDirectory,
    migrationsTable: "sotto_lock_migrations",
  };
  const observer = new Client({ connectionString: databaseUrl });
  await observer.connect();
  try {
    const first = applyDatabaseMigrationSet(input);
    await waitForMigrationLock(observer);
    await expect(applyDatabaseMigrationSet(input)).rejects.toThrow(
      "Another migration is already running",
    );
    await first;
    await applyDatabaseMigrationSet(input);

    const history = await observer.query<{ name: string }>(
      "SELECT name FROM public.sotto_lock_migrations ORDER BY id",
    );
    expect(history.rows).toEqual([{ name: "0001_wait" }]);
  } finally {
    await observer.end();
  }
});
