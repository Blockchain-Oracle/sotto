import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  catalogHumanPurchaseIntent,
  PURCHASE_SOURCE_COMMIT,
  purchaseBindingResolver,
} from "./purchase-journal.fixtures.js";
import {
  createPurchaseTestRuntime,
  restorePurchasePrepareAuthorityForTest,
  testPrepareAuthorityKeyring,
} from "./purchase-postgres.fixtures.js";
import { freshHumanPrepareAuthority } from "./purchase-prepare-authority.fixture.js";

let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_purchase_restore_race_test");
});

afterAll(async () => context?.database.drop());

it("revalidates durable state before minting restored authority", async () => {
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = 599;
    challenge.accepts[0]!.extra.executeBeforeSeconds = 599;
  });
  const purchase = context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(context.runtime),
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: purchaseBindingResolver(),
  });
  const created = await purchase.initializeHumanPurchaseAttempt(intent);
  await purchase.close();
  const keyring = testPrepareAuthorityKeyring(context.runtime);
  const fresh = await freshHumanPrepareAuthority(intent);
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    const original = await client.query<{ jobId: string }>(
      `SELECT job_id::text AS "jobId" FROM sotto.outbox_jobs
       WHERE attempt_id = $1`,
      [created.attemptId],
    );
    const jobId = original.rows[0]!.jobId;
    await expect(
      restorePurchasePrepareAuthorityForTest(
        context.database.databaseUrl,
        keyring,
        created.attemptId,
        async () => {
          await client.query(
            `UPDATE sotto.outbox_jobs
             SET job_id = '018f3f24-7d4a-7e2c-a421-0f3473b94398'
             WHERE attempt_id = $1`,
            [created.attemptId],
          );
          return fresh;
        },
      ),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });

    await client.query(
      "UPDATE sotto.outbox_jobs SET job_id = $2 WHERE attempt_id = $1",
      [created.attemptId, jobId],
    );
    await expect(
      restorePurchasePrepareAuthorityForTest(
        context.database.databaseUrl,
        keyring,
        created.attemptId,
        async () => fresh,
      ),
    ).resolves.toMatchObject({
      purchaseCommitment: created.purchaseCommitment,
    });
  } finally {
    await client.end();
  }
});
