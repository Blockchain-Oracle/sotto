import { Client } from "pg";
import type {
  CatalogRepository,
  CatalogRepositoryInput,
  PurchaseRepository,
  PurchaseRepositoryInput,
} from "../src/index.js";
import { createPostgresTestDatabase } from "./postgres-test-database.js";
import { originRegistration, verifiedProbe } from "./publication.fixtures.js";

export type PurchaseRuntime = Readonly<{
  applyDatabaseMigrations(input: { databaseUrl: string }): Promise<void>;
  createCatalogRepository(input: CatalogRepositoryInput): CatalogRepository;
  createPurchaseRepository(input: PurchaseRepositoryInput): PurchaseRepository;
}>;

export async function createPurchaseTestRuntime(name: string) {
  const database = await createPostgresTestDatabase(name);
  const moduleUrl = new URL("../dist/index.js", import.meta.url).href;
  const runtime = (await import(
    /* @vite-ignore */ moduleUrl
  )) as PurchaseRuntime;
  await runtime.applyDatabaseMigrations({ databaseUrl: database.databaseUrl });
  const catalog = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  try {
    await catalog.registerProviderOrigin(originRegistration);
    await catalog.recordProbeObservation(verifiedProbe);
  } finally {
    await catalog.close();
  }
  return Object.freeze({ database, runtime });
}

export async function purchaseJournalCounts(databaseUrl: string) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{
      attempts: string;
      events: string;
      jobs: string;
    }>(`SELECT
      (SELECT count(*)::text FROM sotto.purchase_attempts) AS attempts,
      (SELECT count(*)::text FROM sotto.attempt_events) AS events,
      (SELECT count(*)::text FROM sotto.outbox_jobs) AS jobs`);
    return result.rows[0]!;
  } finally {
    await client.end();
  }
}
