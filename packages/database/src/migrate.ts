import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";

export type DatabaseMigrationInput = Readonly<{
  databaseUrl: string;
}>;

const migrationsDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const MIGRATIONS_TABLE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;

function validatedDatabaseUrl(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error("database migration URL is required");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("database migration URL is invalid");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("database migration URL must use PostgreSQL");
  }
  if (parsed.hostname.length === 0 || parsed.pathname.length <= 1) {
    throw new Error("database migration URL is invalid");
  }
  return value;
}

export type DatabaseMigrationSetInput = DatabaseMigrationInput &
  Readonly<{
    directory: string;
    migrationsTable: string;
    migrationCount?: number;
  }>;

/** @internal Used by the real PostgreSQL migration-contract tests. */
export async function applyDatabaseMigrationSet(
  input: DatabaseMigrationSetInput,
): Promise<void> {
  const connectionString = validatedDatabaseUrl(input?.databaseUrl);
  if (!isAbsolute(input.directory)) {
    throw new Error("database migration directory must be absolute");
  }
  if (!MIGRATIONS_TABLE_PATTERN.test(input.migrationsTable)) {
    throw new Error("database migrations table is invalid");
  }
  if (
    input.migrationCount !== undefined &&
    (!Number.isInteger(input.migrationCount) || input.migrationCount < 1)
  ) {
    throw new Error("database migration count is invalid");
  }
  await runner({
    databaseUrl: {
      connectionString,
      application_name: "sotto-migrations",
      connectionTimeoutMillis: 10_000,
      lock_timeout: 10_000,
      query_timeout: 30_000,
      statement_timeout: 30_000,
    },
    dir: input.directory,
    direction: "up",
    ...(input.migrationCount === undefined
      ? {}
      : { count: input.migrationCount }),
    migrationsTable: input.migrationsTable,
    migrationsSchema: "public",
    schema: "public",
    checkOrder: true,
    singleTransaction: true,
    noLock: false,
    log: () => undefined,
  });
}

export async function applyDatabaseMigrations(
  input: DatabaseMigrationInput,
): Promise<void> {
  await applyDatabaseMigrationSet({
    ...input,
    directory: migrationsDirectory,
    migrationsTable: "sotto_migrations",
  });
}
