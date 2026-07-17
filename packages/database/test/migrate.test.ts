import { beforeEach, expect, it, vi } from "vitest";

const migration = vi.hoisted(() => ({
  runner: vi.fn(async () => []),
}));

vi.mock("node-pg-migrate", () => migration);

import { applyDatabaseMigrations } from "../src/migrate.js";

beforeEach(() => migration.runner.mockClear());

it("rejects malformed URLs without retaining credentials", async () => {
  const secret = "private-migration-password";
  const error = await applyDatabaseMigrations({
    databaseUrl: `postgresql://owner:${secret}@`,
  }).catch((caught: unknown) => caught);

  expect(error).toEqual(new Error("database migration URL is invalid"));
  expect(JSON.stringify(error)).not.toContain(secret);
  expect(migration.runner).not.toHaveBeenCalled();
});

it("runs migrations through a bounded identified PostgreSQL client", async () => {
  const databaseUrl = "postgresql://owner:secret@database.internal/sotto";

  await applyDatabaseMigrations({ databaseUrl });

  expect(migration.runner).toHaveBeenCalledWith(
    expect.objectContaining({
      databaseUrl: {
        application_name: "sotto-migrations",
        connectionString: databaseUrl,
        connectionTimeoutMillis: 10_000,
        lock_timeout: 10_000,
        query_timeout: 30_000,
        statement_timeout: 30_000,
      },
    }),
  );
});
