import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { projectHumanPurchaseJournalIntent } from "@sotto/x402-canton";
import {
  catalogHumanPurchaseIntent,
  PURCHASE_SOURCE_COMMIT,
  purchaseBindingResolver,
} from "./purchase-journal.fixtures.js";
import {
  createPurchaseTestRuntime,
  purchaseJournalCounts,
  testPrivateDeliveryKeyring,
  testPrepareAuthorityKeyring,
} from "./purchase-postgres.fixtures.js";

let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_purchase_reserve_test");
});

afterAll(async () => context?.database.drop());

it("does not commit a ready job after lock wait consumes its reserve", async () => {
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = 137;
    challenge.accepts[0]!.extra.executeBeforeSeconds = 137;
  });
  const operationId = projectHumanPurchaseJournalIntent(intent).operationId;
  const locker = new Client({
    connectionString: context.database.databaseUrl,
  });
  await locker.connect();
  await locker.query("BEGIN");
  await locker.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `purchase:${operationId}`,
  ]);
  const purchase = context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    privateDeliveryKeyring: testPrivateDeliveryKeyring(context.runtime),
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(context.runtime),
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: purchaseBindingResolver(),
  });
  try {
    const initialization = purchase.initializeHumanPurchaseAttempt(intent);
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    await locker.query("COMMIT");

    await expect(initialization).rejects.toMatchObject({
      code: "PURCHASE_PERSISTENCE",
    });
    expect(await purchaseJournalCounts(context.database.databaseUrl)).toEqual({
      attempts: "0",
      authorities: "0",
      events: "0",
      jobs: "0",
    });
  } finally {
    await locker.query("ROLLBACK").catch(() => undefined);
    await locker.end();
    await purchase.close();
  }
});
