import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";
import { Client } from "pg";
import type { PurchaseRepository } from "../src/index.js";
import {
  catalogHumanPurchaseIntent,
  PURCHASE_SOURCE_COMMIT,
  purchaseBindingResolver,
} from "./purchase-journal.fixtures.js";
import { testPrepareAuthorityKeyring } from "./purchase-postgres.fixtures.js";
import type { createPurchaseTestRuntime } from "./purchase-postgres.fixtures.js";
import { freshHumanPrepareAuthority } from "./purchase-prepare-authority.fixture.js";
import { verifiedHumanPrepare } from "./purchase-prepare-checkpoint.fixture.js";

export type ReconciliationTestContext = Awaited<
  ReturnType<typeof createPurchaseTestRuntime>
>;

export const RECONCILIATION_UPDATE_ID = `1220${"a".repeat(64)}`;

export function reconciliationRepository(
  context: ReconciliationTestContext,
  maxConnections = 1,
): PurchaseRepository {
  return context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(context.runtime),
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: purchaseBindingResolver(),
    maxConnections,
  });
}

export async function setReconciliationOffset(
  context: ReconciliationTestContext,
  attemptId: string,
  reconciliationOffset: number,
): Promise<void> {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    await client.query(
      `UPDATE sotto.settlements SET reconciliation_offset = $2
       WHERE attempt_id = $1`,
      [attemptId, reconciliationOffset],
    );
  } finally {
    await client.end();
  }
}

export async function readReconciliationOffset(
  context: ReconciliationTestContext,
  attemptId: string,
): Promise<string> {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ reconciliationOffset: string }>(
      `SELECT reconciliation_offset::text AS "reconciliationOffset"
       FROM sotto.settlements WHERE attempt_id = $1`,
      [attemptId],
    );
    if (result.rows.length !== 1) throw new Error("test settlement is absent");
    return result.rows[0]!.reconciliationOffset;
  } finally {
    await client.end();
  }
}

export async function readReconciliationEventHash(
  context: ReconciliationTestContext,
  attemptId: string,
  sequence: number,
): Promise<string> {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ eventHash: string }>(
      `SELECT event_hash AS "eventHash" FROM sotto.attempt_events
       WHERE attempt_id = $1 AND sequence = $2`,
      [attemptId, sequence],
    );
    if (result.rows.length !== 1) throw new Error("test event is absent");
    return result.rows[0]!.eventHash;
  } finally {
    await client.end();
  }
}

export function rollbackLatestReconciliationMigration(
  context: ReconciliationTestContext,
): Promise<unknown> {
  return runner({
    databaseUrl: context.database.databaseUrl,
    dir: fileURLToPath(new URL("../migrations/", import.meta.url)),
    direction: "down",
    count: 1,
    migrationsTable: "sotto_migrations",
    migrationsSchema: "public",
    schema: "public",
    checkOrder: true,
    singleTransaction: true,
    noLock: false,
    log: () => undefined,
  });
}

function session(marker: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(marker).digest("hex")}`;
}

async function databaseTime(databaseUrl: string): Promise<string> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ now: Date }>(
      'SELECT clock_timestamp() AS "now"',
    );
    return result.rows[0]!.now.toISOString();
  } finally {
    await client.end();
  }
}

export async function createExecutionStartedAttempt(
  context: ReconciliationTestContext,
  windowSeconds: number,
) {
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = windowSeconds;
    challenge.accepts[0]!.extra.executeBeforeSeconds = windowSeconds;
  });
  const purchase = reconciliationRepository(context);
  const initialized = await purchase.initializeHumanPurchaseAttempt(intent);
  const claim = await purchase.claimHumanPrepareAuthority({
    leaseOwner: `reconcile-setup-${windowSeconds}`,
    leaseMilliseconds: 60_000,
    resolve: async () => freshHumanPrepareAuthority(intent),
  });
  if (claim === null) throw new Error("reconciliation prepare lease is absent");
  const prepared = await verifiedHumanPrepare(claim.intent);
  await purchase.completeHumanPrepare({ lease: claim.lease, prepared });
  const sessionId = session(`reconciliation-${windowSeconds}`);
  const approval = {
    attemptId: initialized.attemptId,
    connectorId: "sotto-reference-wallet",
    connectorKind: "wallet-sdk" as const,
    preparedTransactionHash: prepared.preparedTransactionHash,
    sessionId,
  };
  await purchase.recordHumanApprovalRequested(approval);
  await purchase.recordHumanSignatureVerified({
    ...approval,
    verifiedAt: await databaseTime(context.database.databaseUrl),
  });
  const execution = {
    attemptId: initialized.attemptId,
    commandId: initialized.commandId,
    preparedTransactionHash: prepared.preparedTransactionHash,
    sessionId,
    submissionId: randomUUID(),
    userId: "validator-devnet-m2m",
  };
  await purchase.beginHumanExecution(execution);
  return { execution, initialized, prepared, purchase };
}
