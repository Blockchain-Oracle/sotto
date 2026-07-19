#!/usr/bin/env node
import { applyDatabaseMigrations } from "./migrate.js";

/**
 * Explicit migration job for the Q-006 topology: run once before rolling out a
 * new api/worker build. Reads DATABASE_URL from the environment and applies the
 * tracked migration set up to head. Idempotent — already-applied migrations are
 * skipped by node-pg-migrate's ordering check.
 *
 *   DATABASE_URL=postgres://… sotto-migrate
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl === "") {
    process.stderr.write("sotto-migrate: DATABASE_URL is required\n");
    process.exit(2);
  }
  await applyDatabaseMigrations({ databaseUrl });
  process.stdout.write("sotto-migrate: migrations applied\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`sotto-migrate: ${message}\n`);
  process.exit(1);
});
