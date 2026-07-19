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
  context = await createPurchaseTestRuntime("sotto_human_execution_integrity");
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

it("allows one wallet session to authorize only one purchase", async () => {
  const first = await preparedAttempt(592);
  const second = await preparedAttempt(591);
  const shared = session("shared-wallet-session");
  try {
    const outcomes = await Promise.allSettled([
      first.purchase.recordHumanApprovalRequested(approval(first, shared)),
      second.purchase.recordHumanApprovalRequested(approval(second, shared)),
    ]);
    expect(
      outcomes.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter(({ status }) => status === "rejected"),
    ).toMatchObject([{ reason: { code: "PURCHASE_CONFLICT" } }]);
    const client = new Client({
      connectionString: context.database.databaseUrl,
    });
    await client.connect();
    try {
      const stored = await client.query<{
        approvals: string;
        prepared: string;
      }>(
        `SELECT
          count(*) FILTER (WHERE state = 'approval-requested')::text AS approvals,
          count(*) FILTER (WHERE state = 'prepared-hash-verified')::text AS prepared
         FROM sotto.purchase_attempts WHERE attempt_id IN ($1, $2)`,
        [first.initialized.attemptId, second.initialized.attemptId],
      );
      expect(stored.rows).toEqual([{ approvals: "1", prepared: "1" }]);
    } finally {
      await client.end();
    }
  } finally {
    await first.purchase.close();
    await second.purchase.close();
  }
});

it("rejects NULL lifecycle fields instead of accepting CHECK unknown", async () => {
  const approved = await preparedAttempt(590);
  const pending = await preparedAttempt(589);
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    await approved.purchase.recordHumanApprovalRequested(
      approval(approved, session("null-check-approved")),
    );
    await client.query("BEGIN");
    try {
      await expect(
        client.query(
          `UPDATE sotto.purchase_attempts SET wallet_session_id = NULL
           WHERE attempt_id = $1`,
          [approved.initialized.attemptId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.query("ROLLBACK");
    }

    const prior = await client.query<{ eventHash: string }>(
      `SELECT event_hash AS "eventHash" FROM sotto.attempt_events
       WHERE attempt_id = $1 AND sequence = 2`,
      [pending.initialized.attemptId],
    );
    await client.query("BEGIN");
    try {
      await expect(
        client.query(
          `INSERT INTO sotto.attempt_events
            (attempt_id, sequence, event_type, event_hash,
             previous_event_hash, wallet_session_id,
             wallet_connector_kind, wallet_connector_id)
           VALUES ($1, 3, 'approval-requested', $2, $3, NULL,
             'wallet-sdk', $4)`,
          [
            pending.initialized.attemptId,
            `sha256:${"c".repeat(64)}`,
            prior.rows[0]!.eventHash,
            CONNECTOR,
          ],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    await client.end();
    await approved.purchase.close();
    await pending.purchase.close();
  }
});

it("uses database time to fence expired and future transitions", async () => {
  const expiredApproval = await preparedAttempt(588);
  const futureSignature = await preparedAttempt(587);
  const expiredExecution = await preparedAttempt(586);
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    await client.query(
      `UPDATE sotto.purchase_attempts
       SET execute_before = clock_timestamp() + interval '50 milliseconds'
       WHERE attempt_id = $1`,
      [expiredApproval.initialized.attemptId],
    );
    await client.query("SELECT pg_sleep(0.15)");
    await expect(
      expiredApproval.purchase.recordHumanApprovalRequested(
        approval(expiredApproval, session("expired-approval")),
      ),
    ).rejects.toMatchObject({ code: "PURCHASE_CONFLICT" });

    const futureApproval = approval(
      futureSignature,
      session("future-signature"),
    );
    await futureSignature.purchase.recordHumanApprovalRequested(futureApproval);
    await expect(
      futureSignature.purchase.recordHumanSignatureVerified({
        ...futureApproval,
        verifiedAt: new Date(Date.now() + 700_000).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "PURCHASE_CONFLICT" });

    const executionApproval = approval(
      expiredExecution,
      session("expired-execution"),
    );
    await expiredExecution.purchase.recordHumanApprovalRequested(
      executionApproval,
    );
    await expiredExecution.purchase.recordHumanSignatureVerified({
      ...executionApproval,
      verifiedAt: await databaseTime(client),
    });
    await client.query(
      `UPDATE sotto.purchase_attempts
       SET execute_before = clock_timestamp() + interval '50 milliseconds'
       WHERE attempt_id = $1`,
      [expiredExecution.initialized.attemptId],
    );
    await client.query("SELECT pg_sleep(0.15)");
    await expect(
      expiredExecution.purchase.beginHumanExecution({
        attemptId: expiredExecution.initialized.attemptId,
        commandId: expiredExecution.initialized.commandId,
        preparedTransactionHash:
          expiredExecution.prepared.preparedTransactionHash,
        sessionId: executionApproval.sessionId,
        submissionId: "018f3f24-7d4a-7e2c-a421-0f3473b99055",
        userId: "validator-devnet-m2m",
      }),
    ).rejects.toMatchObject({ code: "PURCHASE_CONFLICT" });
  } finally {
    await client.end();
    await expiredApproval.purchase.close();
    await futureSignature.purchase.close();
    await expiredExecution.purchase.close();
  }
});
