import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { expect, it } from "vitest";
import {
  projectHumanPreparedPurchaseApproval,
  type HashVerifiedHumanPreparedPurchase,
} from "@sotto/x402-canton";
import type { HumanPrepareAuthorityLease } from "../src/index.js";
import {
  catalogHumanPurchaseIntent,
  PURCHASE_SOURCE_COMMIT,
  purchaseBindingResolver,
} from "./purchase-journal.fixtures.js";
import { createPostgresTestDatabase } from "./postgres-test-database.js";
import {
  type PurchaseRuntime,
  testPrivateDeliveryKeyring,
  testPrepareAuthorityKeyring,
} from "./purchase-postgres.fixtures.js";
import {
  readLegacyHumanPurchase,
  seedLegacyHumanPurchase,
} from "./human-execution-legacy.fixture.js";
import { freshHumanPrepareAuthority } from "./purchase-prepare-authority.fixture.js";
import { verifiedHumanPrepare } from "./purchase-prepare-checkpoint.fixture.js";
import { originRegistration, verifiedProbe } from "./publication.fixtures.js";

type Migrations = Readonly<{
  applyDatabaseMigrationSet(input: {
    databaseUrl: string;
    directory: string;
    migrationsTable: string;
    migrationCount?: number;
  }): Promise<void>;
  applyDatabaseMigrations(input: { databaseUrl: string }): Promise<void>;
}>;

const EXECUTION_STATES = [
  "approval-requested",
  "wallet-rejected",
  "wallet-unsupported",
  "signature-verified",
  "execution-started",
] as const;

async function writeLegacyCheckpoint(
  databaseUrl: string,
  lease: HumanPrepareAuthorityLease,
  prepared: HashVerifiedHumanPreparedPurchase,
): Promise<void> {
  const approval = projectHumanPreparedPurchaseApproval(prepared);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const initial = await client.query<{ eventHash: string }>(
      `SELECT event_hash AS "eventHash" FROM sotto.attempt_events
       WHERE attempt_id = $1 AND sequence = 1`,
      [lease.attemptId],
    );
    const previous = initial.rows[0]!.eventHash;
    const body = `sotto-prepared-hash-verified-event-v1\0${lease.attemptId}\0${prepared.preparedTransactionHash}\0${approval.transferContextHash}\0${prepared.verifiedAt}\0${previous}`;
    const eventHash = `sha256:${createHash("sha256").update(body).digest("hex")}`;
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO sotto.attempt_events
        (attempt_id, sequence, event_type, event_hash, previous_event_hash,
         prepared_transaction_hash, transfer_context_hash, prepared_verified_at)
       VALUES ($1, 2, 'prepared-hash-verified', $2, $3, $4, $5, $6)`,
      [
        lease.attemptId,
        eventHash,
        previous,
        prepared.preparedTransactionHash,
        approval.transferContextHash,
        prepared.verifiedAt,
      ],
    );
    await client.query(
      `UPDATE sotto.purchase_attempts
       SET state = 'prepared-hash-verified', prepared_transaction_hash = $2,
         transfer_context_hash = $3, prepared_verified_at = $4
       WHERE attempt_id = $1`,
      [
        lease.attemptId,
        prepared.preparedTransactionHash,
        approval.transferContextHash,
        prepared.verifiedAt,
      ],
    );
    await client.query(
      `UPDATE sotto.outbox_jobs
       SET state = 'completed', result_event_sequence = 2,
         completed_at = transaction_timestamp()
       WHERE job_id = $1`,
      [lease.jobId],
    );
    await client.query(
      `UPDATE sotto.private_prepare_authorities
       SET retired_at = transaction_timestamp() WHERE attempt_id = $1`,
      [lease.attemptId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

it("upgrades event-1/event-2 attempts into the human execution boundary", async () => {
  const database = await createPostgresTestDatabase(
    "sotto_human_execution_upgrade_test",
  );
  const migrations = (await import(
    /* @vite-ignore */ new URL("../dist/migrate.js", import.meta.url).href
  )) as Migrations;
  const runtime = (await import(
    /* @vite-ignore */ new URL("../dist/index.js", import.meta.url).href
  )) as PurchaseRuntime;

  try {
    await migrations.applyDatabaseMigrationSet({
      databaseUrl: database.databaseUrl,
      directory: fileURLToPath(new URL("../migrations/", import.meta.url)),
      migrationsTable: "sotto_migrations",
      migrationCount: 8,
    });
    const catalog = runtime.createCatalogRepository({
      databaseUrl: database.databaseUrl,
    });
    await catalog.registerProviderOrigin(originRegistration);
    await catalog.recordProbeObservation(verifiedProbe);
    await catalog.close();

    const openRepository = () =>
      runtime.createPurchaseRepository({
        databaseUrl: database.databaseUrl,
        privateDeliveryKeyring: testPrivateDeliveryKeyring(runtime),
        prepareAuthorityKeyring: testPrepareAuthorityKeyring(runtime),
        sourceCommit: PURCHASE_SOURCE_COMMIT,
        resolveHumanPurchaseBinding: purchaseBindingResolver(),
      });
    const eventOneIntent = await catalogHumanPurchaseIntent((challenge) => {
      challenge.accepts[0]!.maxTimeoutSeconds = 599;
      challenge.accepts[0]!.extra.executeBeforeSeconds = 599;
    });
    const eventTwoIntent = await catalogHumanPurchaseIntent((challenge) => {
      challenge.accepts[0]!.maxTimeoutSeconds = 598;
      challenge.accepts[0]!.extra.executeBeforeSeconds = 598;
    });
    let eventTwoLifecycle: unknown;
    await seedLegacyHumanPurchase(database.databaseUrl, eventTwoIntent);
    const beforeUpgrade = openRepository();
    try {
      const claim = await beforeUpgrade.claimHumanPrepareAuthority({
        leaseOwner: "human-execution-upgrade",
        leaseMilliseconds: 60_000,
        resolve: async () => freshHumanPrepareAuthority(eventTwoIntent),
      });
      expect(claim).not.toBeNull();
      await writeLegacyCheckpoint(
        database.databaseUrl,
        claim!.lease,
        await verifiedHumanPrepare(claim!.intent),
      );
      eventTwoLifecycle = await readLegacyHumanPurchase(
        database.databaseUrl,
        eventTwoIntent,
      );
      await seedLegacyHumanPurchase(database.databaseUrl, eventOneIntent);
      await readLegacyHumanPurchase(database.databaseUrl, eventOneIntent);
    } finally {
      await beforeUpgrade.close();
    }

    await migrations.applyDatabaseMigrations({
      databaseUrl: database.databaseUrl,
    });

    const client = new Client({ connectionString: database.databaseUrl });
    await client.connect();
    try {
      const history = await client.query<{ name: string }>(
        "SELECT name FROM public.sotto_migrations ORDER BY id",
      );
      expect(history.rows.at(-1)).toEqual({
        name: "0011_paid_delivery",
      });

      const settlement = await client.query<{
        columns: string[];
        tableName: string | null;
      }>(`SELECT
          to_regclass('sotto.settlements')::text AS "tableName",
          ARRAY(
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'sotto' AND table_name = 'settlements'
            ORDER BY column_name
          )::text[] AS columns`);
      expect(settlement.rows).toEqual([
        {
          tableName: "sotto.settlements",
          columns: expect.arrayContaining([
            "attempt_id",
            "created_at",
            "expectation",
            "expectation_digest",
            "expectation_schema",
          ]),
        },
      ]);

      const constraints = await client.query<{ definition: string }>(
        `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
         WHERE conrelid IN (
           'sotto.purchase_attempts'::regclass,
           'sotto.attempt_events'::regclass,
           'sotto.outbox_jobs'::regclass,
           'sotto.settlements'::regclass
         )`,
      );
      const definitions = constraints.rows
        .map(({ definition }) => definition)
        .join("\n");
      for (const state of EXECUTION_STATES)
        expect(definitions).toContain(state);
      expect(definitions).toContain("purchase-reconcile");
      expect(definitions).toContain(
        "sotto-human-settlement-expectation-journal-v1",
      );
    } finally {
      await client.end();
    }

    const afterUpgrade = openRepository();
    const inspector = new Client({ connectionString: database.databaseUrl });
    await inspector.connect();
    try {
      await expect(
        afterUpgrade.initializeHumanPurchaseAttempt(eventOneIntent),
      ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
      await expect(
        afterUpgrade.initializeHumanPurchaseAttempt(eventTwoIntent),
      ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
      const legacy = eventTwoLifecycle as {
        attemptId: `sha256:${string}`;
        prepared: { preparedTransactionHash: `sha256:${string}` };
      };
      await expect(
        afterUpgrade.readHumanSettlementExpectation(legacy.attemptId),
      ).resolves.toBeNull();
      await expect(
        afterUpgrade.recordHumanApprovalRequested({
          attemptId: legacy.attemptId,
          preparedTransactionHash: legacy.prepared.preparedTransactionHash,
          connectorId: "sotto-reference-wallet",
          connectorKind: "wallet-sdk",
          sessionId: `sha256:${"d".repeat(64)}`,
        }),
      ).rejects.toMatchObject({ code: "PURCHASE_CONFLICT" });
      const legacyState = await inspector.query<{
        events: string;
        reconcileJobs: string;
        state: string;
        walletSessionId: string | null;
      }>(
        `SELECT attempt.state,
          attempt.wallet_session_id AS "walletSessionId",
          (SELECT count(*)::text FROM sotto.attempt_events event
            WHERE event.attempt_id = attempt.attempt_id) AS events,
          (SELECT count(*)::text FROM sotto.outbox_jobs job
            WHERE job.attempt_id = attempt.attempt_id
              AND job.kind = 'purchase-reconcile') AS "reconcileJobs"
         FROM sotto.purchase_attempts attempt WHERE attempt.attempt_id = $1`,
        [legacy.attemptId],
      );
      expect(legacyState.rows).toEqual([
        {
          events: "2",
          reconcileJobs: "0",
          state: "prepared-hash-verified",
          walletSessionId: null,
        },
      ]);
    } finally {
      await inspector.end();
      await afterUpgrade.close();
    }
  } finally {
    await database.drop();
  }
});
