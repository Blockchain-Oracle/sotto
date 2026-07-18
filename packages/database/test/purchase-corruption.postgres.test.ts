import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  catalogHumanPurchaseIntent,
  PURCHASE_SOURCE_COMMIT,
  purchaseBindingResolver,
} from "./purchase-journal.fixtures.js";
import {
  createPurchaseTestRuntime,
  purchaseJournalCounts,
} from "./purchase-postgres.fixtures.js";

let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_purchase_corruption_test");
});

afterAll(async () => context?.database.drop());

function repository() {
  return context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: purchaseBindingResolver(),
  });
}

async function mutate(sql: string, attemptId: string): Promise<void> {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    await client.query(sql, [attemptId]);
  } finally {
    await client.end();
  }
}

it("does not recreate missing initial outbox work during replay", async () => {
  const intent = await catalogHumanPurchaseIntent();
  const purchase = repository();
  try {
    await purchase.initializeHumanPurchaseAttempt(intent);
    await mutate(
      "DELETE FROM sotto.outbox_jobs WHERE attempt_id = $1",
      intent.attemptId,
    );
    await expect(
      purchase.initializeHumanPurchaseAttempt(intent),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
    expect(await purchaseJournalCounts(context.database.databaseUrl)).toEqual({
      attempts: "1",
      events: "1",
      jobs: "0",
    });
  } finally {
    await purchase.close();
  }
});

it("rejects valid-looking stored identity corruption", async () => {
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = 599;
    challenge.accepts[0]!.extra.executeBeforeSeconds = 599;
  });
  const purchase = repository();
  try {
    await purchase.initializeHumanPurchaseAttempt(intent);
    await mutate(
      `UPDATE sotto.purchase_attempts SET source_commit = '${"e".repeat(40)}'
       WHERE attempt_id = $1`,
      intent.attemptId,
    );
    await expect(
      purchase.initializeHumanPurchaseAttempt(intent),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
    expect(await purchaseJournalCounts(context.database.databaseUrl)).toEqual({
      attempts: "2",
      events: "2",
      jobs: "1",
    });
  } finally {
    await purchase.close();
  }
});
