import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";

const POSTGRES_IMAGE =
  "postgres:18.4-bookworm@sha256:1961f96e6029a02c3812d7cb329a3b03a3ac2bb067058dec17b0f5596aca9296";
const EXPECTED_SERVER_VERSION = "180004";

describe("PostgreSQL migrations", () => {
  let connectionString: string;

  beforeAll(async () => {
    expect(process.env.SOTTO_TEST_POSTGRES_IMAGE).toBe(POSTGRES_IMAGE);
    expect(process.env.DATABASE_URL).toBeUndefined();
    connectionString = process.env.SOTTO_TEST_DATABASE_URL ?? "";
    expect(connectionString).toMatch(/^postgresql:\/\/sotto_test:/u);

    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 10_000,
      query_timeout: 10_000,
    });
    await client.connect();
    try {
      const identity = await client.query<{
        catalog: string;
        database: string;
        pid: number;
        version: string;
      }>(`
        SELECT
          current_setting('server_version_num') AS version,
          current_database() AS database,
          pg_backend_pid() AS pid,
          to_regclass('pg_catalog.pg_class')::text AS catalog
      `);
      expect(identity.rows).toEqual([
        {
          catalog: "pg_class",
          database: "sotto_test",
          pid: expect.any(Number),
          version: EXPECTED_SERVER_VERSION,
        },
      ]);
      const empty = await client.query<{ owners: string | null }>(
        "SELECT to_regclass('sotto.owners')::text AS owners",
      );
      expect(empty.rows).toEqual([{ owners: null }]);
    } finally {
      await client.end();
    }
  });

  it("applies the initial migration once to an empty real database", async () => {
    const migrationModule = new URL("../dist/migrate.js", import.meta.url).href;
    const { applyDatabaseMigrations } = (await import(
      /* @vite-ignore */ migrationModule
    )) as {
      applyDatabaseMigrations(input: { databaseUrl: string }): Promise<void>;
    };

    await applyDatabaseMigrations({ databaseUrl: connectionString });
    await applyDatabaseMigrations({ databaseUrl: connectionString });

    const client = new Client({ connectionString });
    await client.connect();
    try {
      const owners = await client.query<{ owners: string | null }>(
        "SELECT to_regclass('sotto.owners')::text AS owners",
      );
      expect(owners.rows).toEqual([{ owners: "sotto.owners" }]);
      const catalog = await client.query<{
        origins: string | null;
        providers: string | null;
        registrations: string | null;
      }>(`
        SELECT
          to_regclass('sotto.providers')::text AS providers,
          to_regclass('sotto.origins')::text AS origins,
          to_regclass('sotto.catalog_registrations')::text AS registrations
      `);
      expect(catalog.rows).toEqual([
        {
          origins: "sotto.origins",
          providers: "sotto.providers",
          registrations: "sotto.catalog_registrations",
        },
      ]);
      const migrations = await client.query<{ name: string }>(
        "SELECT name FROM public.sotto_migrations ORDER BY id",
      );
      expect(migrations.rows).toEqual([
        { name: "0001_catalog" },
        { name: "0002_provider_origins" },
        { name: "0003_resource_publication" },
        { name: "0004_resource_health" },
      ]);
    } finally {
      await client.end();
    }
  });
});
