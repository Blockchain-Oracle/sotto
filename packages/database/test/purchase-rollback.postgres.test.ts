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
  testPrivateDeliveryKeyring,
  testPrepareAuthorityKeyring,
} from "./purchase-postgres.fixtures.js";

let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_purchase_rollback_test");
});

afterAll(async () => context?.database.drop());

it("rolls back the attempt when private authority persistence fails", async () => {
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = 599;
    challenge.accepts[0]!.extra.executeBeforeSeconds = 599;
  });
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE FUNCTION sotto.reject_test_private_authority()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.attempt_id = '${intent.attemptId}' THEN
          RAISE EXCEPTION 'forced private authority failure' USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END $$`);
    await client.query(`CREATE TRIGGER reject_test_private_authority
      BEFORE INSERT ON sotto.private_prepare_authorities FOR EACH ROW
      EXECUTE FUNCTION sotto.reject_test_private_authority()`);
  } finally {
    await client.end();
  }
  const repository = context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    privateDeliveryKeyring: testPrivateDeliveryKeyring(context.runtime),
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(context.runtime),
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: purchaseBindingResolver(),
  });
  try {
    await expect(
      repository.initializeHumanPurchaseAttempt(intent),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
    expect(await purchaseJournalCounts(context.database.databaseUrl)).toEqual({
      attempts: "0",
      authorities: "0",
      events: "0",
      jobs: "0",
    });
  } finally {
    await repository.close();
  }
});

it("rolls back the attempt and event when outbox persistence fails", async () => {
  const intent = await catalogHumanPurchaseIntent();
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE FUNCTION sotto.reject_test_purchase_job()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.attempt_id = '${intent.attemptId}' THEN
          RAISE EXCEPTION 'forced test outbox failure' USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END $$`);
    await client.query(`CREATE TRIGGER reject_test_purchase_job
      BEFORE INSERT ON sotto.outbox_jobs FOR EACH ROW
      EXECUTE FUNCTION sotto.reject_test_purchase_job()`);
  } finally {
    await client.end();
  }

  const repository = context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    privateDeliveryKeyring: testPrivateDeliveryKeyring(context.runtime),
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(context.runtime),
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: purchaseBindingResolver(),
  });
  try {
    await expect(
      repository.initializeHumanPurchaseAttempt(intent),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
    expect(await purchaseJournalCounts(context.database.databaseUrl)).toEqual({
      attempts: "0",
      authorities: "0",
      events: "0",
      jobs: "0",
    });
  } finally {
    await repository.close();
  }
});
