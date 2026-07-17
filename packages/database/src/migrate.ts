import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";

export type DatabaseMigrationInput = Readonly<{
  databaseUrl: string;
}>;

const migrationsDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

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

export async function applyDatabaseMigrations(
  input: DatabaseMigrationInput,
): Promise<void> {
  const connectionString = validatedDatabaseUrl(input?.databaseUrl);
  await runner({
    databaseUrl: {
      connectionString,
      application_name: "sotto-migrations",
      connectionTimeoutMillis: 10_000,
      lock_timeout: 10_000,
      query_timeout: 30_000,
      statement_timeout: 30_000,
    },
    dir: migrationsDirectory,
    direction: "up",
    migrationsTable: "sotto_migrations",
    migrationsSchema: "public",
    schema: "public",
    checkOrder: true,
    singleTransaction: true,
    noLock: false,
    log: () => undefined,
  });
}
