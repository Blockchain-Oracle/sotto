import { createHash } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PurchaseRepository } from "../src/index.js";
import {
  catalogHumanPurchaseIntent,
  PURCHASE_SOURCE_COMMIT,
  purchaseBindingResolver,
} from "./purchase-journal.fixtures.js";
import {
  createPurchaseTestRuntime,
  testPrivateDeliveryKeyring,
  testPrepareAuthorityKeyring,
} from "./purchase-postgres.fixtures.js";
import { freshHumanPrepareAuthority } from "./purchase-prepare-authority.fixture.js";
import { verifiedHumanPrepare } from "./purchase-prepare-checkpoint.fixture.js";

const CONNECTOR = "sotto-reference-wallet";
let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_human_execution_fence");
});

afterAll(async () => context?.database.drop());

function repository(): PurchaseRepository {
  return context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    privateDeliveryKeyring: testPrivateDeliveryKeyring(context.runtime),
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(context.runtime),
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: purchaseBindingResolver(),
  });
}

async function preparedAttempt(windowSeconds: number) {
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = windowSeconds;
    challenge.accepts[0]!.extra.executeBeforeSeconds = windowSeconds;
  });
  const purchase = repository();
  const initialized = await purchase.initializeHumanPurchaseAttempt(intent);
  const claim = await purchase.claimHumanPrepareAuthority({
    leaseOwner: `integrity-worker-${windowSeconds}`,
    leaseMilliseconds: 60_000,
    resolve: async () => freshHumanPrepareAuthority(intent),
  });
  const prepared = await verifiedHumanPrepare(claim!.intent);
  await purchase.completeHumanPrepare({ lease: claim!.lease, prepared });
  return { initialized, prepared, purchase };
}

function session(marker: string) {
  return `sha256:${createHash("sha256").update(marker).digest("hex")}` as const;
}

function approval(
  attempt: Awaited<ReturnType<typeof preparedAttempt>>,
  sessionId: `sha256:${string}`,
) {
  return {
    attemptId: attempt.initialized.attemptId,
    preparedTransactionHash: attempt.prepared.preparedTransactionHash,
    connectorId: CONNECTOR,
    connectorKind: "wallet-sdk" as const,
    sessionId,
  };
}

async function databaseTime(client: Client): Promise<string> {
  const result = await client.query<{ now: Date }>(
    'SELECT clock_timestamp() AS "now"',
  );
  return result.rows[0]!.now.toISOString();
}

it("lets exactly one different-submission execution fence win", async () => {
  const attempt = await preparedAttempt(584);
  const contender = repository();
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    const approved = approval(attempt, session("execution-race"));
    await attempt.purchase.recordHumanApprovalRequested(approved);
    await attempt.purchase.recordHumanSignatureVerified({
      ...approved,
      verifiedAt: await databaseTime(client),
    });
    const base = {
      attemptId: attempt.initialized.attemptId,
      commandId: attempt.initialized.commandId,
      preparedTransactionHash: attempt.prepared.preparedTransactionHash,
      sessionId: approved.sessionId,
      userId: "validator-devnet-m2m",
    };
    const outcomes = await Promise.allSettled([
      attempt.purchase.beginHumanExecution({
        ...base,
        submissionId: "018f3f24-7d4a-7e2c-a421-0f3473b99077",
      }),
      contender.beginHumanExecution({
        ...base,
        submissionId: "018f3f24-7d4a-7e2c-a421-0f3473b99078",
      }),
    ]);
    expect(
      outcomes.filter(({ status }) => status === "fulfilled"),
    ).toMatchObject([
      { value: { outcome: "created", state: "execution-started" } },
    ]);
    expect(
      outcomes.filter(({ status }) => status === "rejected"),
    ).toMatchObject([{ reason: { code: "PURCHASE_CONFLICT" } }]);
    const durable = await client.query<{ events: string; jobs: string }>(
      `SELECT
        (SELECT count(*)::text FROM sotto.attempt_events event
          WHERE event.attempt_id = $1 AND event.sequence = 5) AS events,
        (SELECT count(*)::text FROM sotto.outbox_jobs job
          WHERE job.attempt_id = $1 AND job.kind = 'purchase-reconcile') AS jobs`,
      [attempt.initialized.attemptId],
    );
    expect(durable.rows).toEqual([{ events: "1", jobs: "1" }]);
  } finally {
    await client.end();
    await contender.close();
    await attempt.purchase.close();
  }
});

it("rolls back a failed execution fence and keeps advanced replays exact", async () => {
  const attempt = await preparedAttempt(585);
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  const approved = approval(attempt, session("execution-fence"));
  const execution = {
    attemptId: attempt.initialized.attemptId,
    commandId: attempt.initialized.commandId,
    preparedTransactionHash: attempt.prepared.preparedTransactionHash,
    sessionId: approved.sessionId,
    submissionId: "018f3f24-7d4a-7e2c-a421-0f3473b99066",
    userId: "validator-devnet-m2m",
  };
  try {
    const approvalResult =
      await attempt.purchase.recordHumanApprovalRequested(approved);
    const signatureInput = {
      ...approved,
      verifiedAt: await databaseTime(client),
    };
    const signatureResult =
      await attempt.purchase.recordHumanSignatureVerified(signatureInput);
    await client.query(`CREATE FUNCTION sotto.reject_reconcile_job()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.kind = 'purchase-reconcile' THEN
          RAISE EXCEPTION 'forced reconcile job failure';
        END IF;
        RETURN NEW;
      END $$`);
    await client.query(`CREATE TRIGGER reject_reconcile_job
      BEFORE INSERT ON sotto.outbox_jobs
      FOR EACH ROW EXECUTE FUNCTION sotto.reject_reconcile_job()`);
    await expect(
      attempt.purchase.beginHumanExecution(execution),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
    await expect(
      attempt.purchase.readHumanPurchaseLifecycle(
        attempt.initialized.attemptId,
      ),
    ).resolves.toMatchObject({ state: "signature-verified" });
    await client.query(
      "DROP TRIGGER reject_reconcile_job ON sotto.outbox_jobs",
    );
    await client.query("DROP FUNCTION sotto.reject_reconcile_job() ");

    await expect(
      attempt.purchase.beginHumanExecution(execution),
    ).resolves.toMatchObject({
      outcome: "created",
      state: "execution-started",
    });
    await expect(
      attempt.purchase.beginHumanExecution({
        ...execution,
        commandId: `sotto-human-purchase-v1-${"f".repeat(64)}`,
      }),
    ).rejects.toMatchObject({ code: "PURCHASE_CONFLICT" });
    await expect(
      attempt.purchase.recordHumanApprovalRequested(approved),
    ).resolves.toMatchObject({
      outcome: "replayed",
      event: { sequence: approvalResult.event.sequence },
    });
    await expect(
      attempt.purchase.recordHumanSignatureVerified(signatureInput),
    ).resolves.toMatchObject({
      outcome: "replayed",
      event: { sequence: signatureResult.event.sequence },
    });

    await client.query(
      `DELETE FROM sotto.outbox_jobs
       WHERE attempt_id = $1 AND kind = 'purchase-reconcile'`,
      [attempt.initialized.attemptId],
    );
    await expect(
      attempt.purchase.beginHumanExecution(execution),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
  } finally {
    await client.query(
      "DROP TRIGGER IF EXISTS reject_reconcile_job ON sotto.outbox_jobs",
    );
    await client.query("DROP FUNCTION IF EXISTS sotto.reject_reconcile_job() ");
    await client.end();
    await attempt.purchase.close();
  }
});
