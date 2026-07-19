import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import type {
  CatalogRepository,
  ProviderOriginRegistration,
} from "../src/index.js";
import { createPostgresTestDatabase } from "./postgres-test-database.js";

let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
type RepositoryFactory = (input: { databaseUrl: string }) => CatalogRepository;
type RuntimeModule = Readonly<{
  applyDatabaseMigrations(input: { databaseUrl: string }): Promise<unknown>;
  createCatalogRepository: RepositoryFactory;
}>;
let createRepository: RepositoryFactory;

function input(seed: string): ProviderOriginRegistration {
  return {
    registrationId: `018f3f24-7d4a-7e2c-a421-0f3473b9${seed}00`,
    ownerId: `018f3f24-7d4a-7e2c-a421-0f3473b9${seed}01`,
    ownerPartyId: `sotto-owner-${seed}::1220owner`,
    providerId: `018f3f24-7d4a-7e2c-a421-0f3473b9${seed}02`,
    providerDisplayName: `Provider ${seed}`,
    originId: `018f3f24-7d4a-7e2c-a421-0f3473b9${seed}03`,
    originUrl: `https://api-${seed}.example.com/`,
  };
}

async function durableCandidateState(
  candidates: readonly ProviderOriginRegistration[],
) {
  const client = new Client({ connectionString: database.databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{
      owners: string;
      providers: string;
      origins: string;
      registrations: string;
      normalized_origins: string[];
    }>(
      `SELECT
        (SELECT count(*)::text FROM sotto.owners WHERE id = ANY($1::uuid[])) AS owners,
        (SELECT count(*)::text FROM sotto.providers WHERE id = ANY($2::uuid[])) AS providers,
        (SELECT count(*)::text FROM sotto.origins WHERE id = ANY($3::uuid[])) AS origins,
        (SELECT count(*)::text FROM sotto.catalog_registrations
          WHERE registration_id = ANY($4::uuid[])) AS registrations,
        (SELECT array_agg(normalized_origin ORDER BY normalized_origin)
          FROM sotto.origins WHERE id = ANY($3::uuid[])) AS normalized_origins`,
      [
        candidates.map(({ ownerId }) => ownerId),
        candidates.map(({ providerId }) => providerId),
        candidates.map(({ originId }) => originId),
        candidates.map(({ registrationId }) => registrationId),
      ],
    );
    return result.rows[0];
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  database = await createPostgresTestDatabase("sotto_catalog_concurrency_test");
  const moduleUrl = new URL("../dist/index.js", import.meta.url).href;
  const runtime = (await import(/* @vite-ignore */ moduleUrl)) as RuntimeModule;
  await runtime.applyDatabaseMigrations({ databaseUrl: database.databaseUrl });
  createRepository = runtime.createCatalogRepository;
});

afterAll(async () => database?.drop());

it("serializes two exact registration replays", async () => {
  const repository = createRepository({ databaseUrl: database.databaseUrl });
  try {
    const results = await Promise.all([
      repository.registerProviderOrigin(input("10")),
      repository.registerProviderOrigin(input("10")),
    ]);
    expect(results.map(({ outcome }) => outcome).sort()).toEqual([
      "created",
      "replayed",
    ]);
  } finally {
    await repository.close();
  }
  expect(await durableCandidateState([input("10")])).toEqual({
    owners: "1",
    providers: "1",
    origins: "1",
    registrations: "1",
    normalized_origins: ["https://api-10.example.com"],
  });
});

it("allows exactly one owner to claim equivalent origins", async () => {
  const repository = createRepository({ databaseUrl: database.databaseUrl });
  const first = input("20");
  const second = {
    ...input("21"),
    originUrl: "https://API-20.EXAMPLE.COM:443/",
  };
  try {
    const results = await Promise.allSettled([
      repository.registerProviderOrigin(first),
      repository.registerProviderOrigin(second),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    const rejected = results.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({
      reason: {
        code: "CATALOG_CONFLICT",
        message: "catalog identity conflict",
      },
    });
  } finally {
    await repository.close();
  }

  expect(await durableCandidateState([first, second])).toEqual({
    owners: "1",
    providers: "1",
    origins: "1",
    registrations: "1",
    normalized_origins: ["https://api-20.example.com"],
  });
});
