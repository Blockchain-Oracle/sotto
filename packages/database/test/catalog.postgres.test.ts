import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createPostgresTestDatabase } from "./postgres-test-database.js";

type ProviderOriginInput = Readonly<{
  registrationId: string;
  ownerId: string;
  ownerPartyId: string;
  providerId: string;
  providerDisplayName: string;
  originId: string;
  originUrl: string;
}>;

type ProviderOriginRecord = Readonly<{
  registrationId: string;
  ownerId: string;
  ownerPartyId: string;
  providerId: string;
  providerDisplayName: string;
  originId: string;
  normalizedOrigin: string;
}>;

type CatalogStore = Readonly<{
  registerProviderOrigin(
    input: ProviderOriginInput,
  ): Promise<ProviderOriginRecord & { outcome: "created" | "replayed" }>;
  findProviderOrigin(url: string): Promise<ProviderOriginRecord | null>;
  close(): Promise<void>;
}>;

let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;

beforeAll(async () => {
  database = await createPostgresTestDatabase("sotto_catalog_test");
  const migrationUrl = new URL("../dist/migrate.js", import.meta.url).href;
  const migration = (await import(/* @vite-ignore */ migrationUrl)) as {
    applyDatabaseMigrations(input: { databaseUrl: string }): Promise<void>;
  };
  await migration.applyDatabaseMigrations({
    databaseUrl: database.databaseUrl,
  });
});

afterAll(async () => database?.drop());

it("persists one owner provider and normalized HTTPS origin atomically", async () => {
  const catalogUrl = new URL("../dist/catalog.js", import.meta.url).href;
  const { createCatalogRepository } = (await import(
    /* @vite-ignore */ catalogUrl
  )) as {
    createCatalogRepository(input: { databaseUrl: string }): CatalogStore;
  };
  const store = createCatalogRepository({ databaseUrl: database.databaseUrl });
  const input: ProviderOriginInput = {
    registrationId: "018f3f24-7d4a-7e2c-a421-0f3473b94200",
    ownerId: "018f3f24-7d4a-7e2c-a421-0f3473b94201",
    ownerPartyId: "sotto-owner::1220owner",
    providerId: "018f3f24-7d4a-7e2c-a421-0f3473b94202",
    providerDisplayName: "Ada's API'); DROP TABLE sotto.owners; --",
    originId: "018f3f24-7d4a-7e2c-a421-0f3473b94203",
    originUrl: "https://API.Example.com:443/",
  };
  const { originUrl: _originUrl, ...persistedInput } = input;
  void _originUrl;
  const expected: ProviderOriginRecord = {
    ...persistedInput,
    normalizedOrigin: "https://api.example.com",
  };

  try {
    await expect(store.registerProviderOrigin(input)).resolves.toEqual({
      ...expected,
      outcome: "created",
    });
    await expect(store.registerProviderOrigin(input)).resolves.toEqual({
      ...expected,
      outcome: "replayed",
    });
    await expect(
      store.registerProviderOrigin({
        ...input,
        registrationId: "018f3f24-7d4a-7e2c-a421-0f3473b94209",
      }),
    ).rejects.toMatchObject({ code: "CATALOG_CONFLICT" });
    await expect(
      store.registerProviderOrigin({
        ...input,
        providerDisplayName: "Changed provider",
      }),
    ).rejects.toMatchObject({ code: "CATALOG_CONFLICT" });
    await expect(
      store.registerProviderOrigin({
        ...input,
        registrationId: "018f3f24-7d4a-7e2c-a421-0f3473b94210",
        ownerId: "018f3f24-7d4a-7e2c-a421-0f3473b94211",
        ownerPartyId: "sotto-attacker::1220attacker",
        providerId: "018f3f24-7d4a-7e2c-a421-0f3473b94212",
        originId: "018f3f24-7d4a-7e2c-a421-0f3473b94213",
      }),
    ).rejects.toMatchObject({
      code: "CATALOG_CONFLICT",
      message: "catalog identity conflict",
    });
    await expect(
      store.registerProviderOrigin({
        ...input,
        originUrl: "http://api.example.com",
      }),
    ).rejects.toThrow(/HTTPS/iu);
    await expect(
      store.registerProviderOrigin({
        ...input,
        originUrl: "https://api.example.com/path",
      }),
    ).rejects.toThrow(/origin/iu);
  } finally {
    await store.close();
  }

  const client = new Client({ connectionString: database.databaseUrl });
  await client.connect();
  try {
    const counts = await client.query<{
      origins: string;
      owners: string;
      providers: string;
      registrations: string;
    }>(`
      SELECT
        (SELECT count(*)::text FROM sotto.owners) AS owners,
        (SELECT count(*)::text FROM sotto.providers) AS providers,
        (SELECT count(*)::text FROM sotto.origins) AS origins,
        (SELECT count(*)::text FROM sotto.catalog_registrations) AS registrations
    `);
    expect(counts.rows).toEqual([
      { origins: "1", owners: "1", providers: "1", registrations: "1" },
    ]);
    const registrationColumns = await client.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'sotto' AND table_name = 'catalog_registrations'
      ORDER BY column_name
    `);
    expect(
      registrationColumns.rows.map(({ column_name }) => column_name),
    ).toEqual(["created_at", "origin_id", "registration_id", "request_hash"]);
  } finally {
    await client.end();
  }

  const restarted = createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  try {
    await expect(
      restarted.findProviderOrigin("https://API.EXAMPLE.com:443/"),
    ).resolves.toEqual(expected);
  } finally {
    await restarted.close();
  }
});
