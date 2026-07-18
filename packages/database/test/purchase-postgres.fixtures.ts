import { createSecretKey } from "node:crypto";
import { Client, Pool } from "pg";
import type { HumanPurchaseLedgerIntent } from "@sotto/x402-canton";
import type {
  CatalogRepository,
  CatalogRepositoryInput,
  PrepareAuthorityKeyring,
  PrepareAuthorityKeyringInput,
  PurchaseRepository,
  PurchaseRepositoryInput,
} from "../src/index.js";
import { PurchasePersistenceError } from "../src/index.js";
import type { HumanPrepareAuthorityResolver } from "../src/purchase-types.js";
import { createPostgresTestDatabase } from "./postgres-test-database.js";
import { originRegistration, verifiedProbe } from "./publication.fixtures.js";

export type PurchaseRuntime = Readonly<{
  applyDatabaseMigrations(input: { databaseUrl: string }): Promise<void>;
  createCatalogRepository(input: CatalogRepositoryInput): CatalogRepository;
  createPrepareAuthorityKeyring(
    input: PrepareAuthorityKeyringInput,
  ): PrepareAuthorityKeyring;
  createPurchaseRepository(input: PurchaseRepositoryInput): PurchaseRepository;
}>;

export function testPrepareAuthorityKeyring(
  runtime: PurchaseRuntime,
  marker = 7,
  keyId = "prepare-key-2026-07",
): PrepareAuthorityKeyring {
  return runtime.createPrepareAuthorityKeyring({
    activeKeyId: keyId,
    keys: [
      {
        id: keyId,
        key: createSecretKey(Buffer.alloc(32, marker)),
      },
    ],
  });
}

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
      authorities: string;
      events: string;
      jobs: string;
    }>(`SELECT
      (SELECT count(*)::text FROM sotto.purchase_attempts) AS attempts,
      (SELECT count(*)::text FROM sotto.private_prepare_authorities)
        AS authorities,
      (SELECT count(*)::text FROM sotto.attempt_events) AS events,
      (SELECT count(*)::text FROM sotto.outbox_jobs) AS jobs`);
    return result.rows[0]!;
  } finally {
    await client.end();
  }
}

export async function humanExecutionFenceCounts(
  databaseUrl: string,
  attemptId: string,
): Promise<Readonly<{ events: string; jobs: string }>> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ events: string; jobs: string }>(
      `SELECT
        (SELECT count(*)::text FROM sotto.attempt_events event
          WHERE event.attempt_id = $1 AND event.sequence = 5) AS events,
        (SELECT count(*)::text FROM sotto.outbox_jobs job
          WHERE job.attempt_id = $1 AND job.kind = 'purchase-reconcile') AS jobs`,
      [attemptId],
    );
    return result.rows[0]!;
  } finally {
    await client.end();
  }
}

type RestoreModule = Readonly<{
  claimPurchasePrepareAuthorityLease(
    pool: Pool,
    input: {
      leaseOwner: string;
      leaseMilliseconds?: number;
      attemptId?: `sha256:${string}`;
    },
  ): Promise<unknown>;
  restorePurchasePrepareAuthority(
    pool: Pool,
    keyring: PrepareAuthorityKeyring,
    lease: unknown,
    resolve: HumanPrepareAuthorityResolver,
  ): Promise<HumanPurchaseLedgerIntent>;
}>;

export async function restorePurchasePrepareAuthorityForTest(
  databaseUrl: string,
  keyring: PrepareAuthorityKeyring,
  attemptId: string,
  resolve: HumanPrepareAuthorityResolver,
): Promise<HumanPurchaseLedgerIntent> {
  const restoreModule = (await import(
    /* @vite-ignore */ new URL(
      "../dist/purchase-prepare-authority-restore.js",
      import.meta.url,
    ).href
  )) as RestoreModule;
  const leaseModule = (await import(
    /* @vite-ignore */ new URL(
      "../dist/purchase-prepare-authority-lease.js",
      import.meta.url,
    ).href
  )) as RestoreModule;
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
    statement_timeout: 10_000,
  });
  try {
    await pool.query(
      `UPDATE sotto.outbox_jobs
       SET claimed_at = transaction_timestamp() - interval '31 seconds',
        lease_expires_at = transaction_timestamp() - interval '1 second'
       WHERE attempt_id = $1 AND state = 'leased'`,
      [attemptId],
    );
    const lease = await leaseModule.claimPurchasePrepareAuthorityLease(pool, {
      leaseOwner: "test-prepare-worker",
      leaseMilliseconds: 30_000,
      attemptId: attemptId as `sha256:${string}`,
    });
    if (lease === null) throw new PurchasePersistenceError();
    return await restoreModule.restorePurchasePrepareAuthority(
      pool,
      keyring,
      lease,
      resolve,
    );
  } finally {
    await pool.end();
  }
}
