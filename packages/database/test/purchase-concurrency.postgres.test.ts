import { afterAll, beforeAll, expect, it, vi } from "vitest";
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
  context = await createPurchaseTestRuntime("sotto_purchase_concurrency_test");
});

afterAll(async () => context?.database.drop());

function repository(resolveHumanPurchaseBinding = purchaseBindingResolver()) {
  return context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding,
  });
}

it("serializes identical initialization across independent pools", async () => {
  const first = repository();
  const second = repository();
  const intent = await catalogHumanPurchaseIntent();
  try {
    const results = await Promise.all([
      first.initializeHumanPurchaseAttempt(intent),
      second.initializeHumanPurchaseAttempt(intent),
    ]);
    expect(results.map(({ outcome }) => outcome).sort()).toEqual([
      "created",
      "replayed",
    ]);
    expect(results[0]).toEqual({ ...results[1], outcome: results[0]!.outcome });
    expect(await purchaseJournalCounts(context.database.databaseUrl)).toEqual({
      attempts: "1",
      events: "1",
      jobs: "1",
    });
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});

it("rejects a structural clone before resolving tenancy or writing", async () => {
  const resolver = vi.fn(purchaseBindingResolver());
  const purchase = repository(resolver);
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = 599;
    challenge.accepts[0]!.extra.executeBeforeSeconds = 599;
  });
  try {
    await expect(
      purchase.initializeHumanPurchaseAttempt(structuredClone(intent) as never),
    ).rejects.toThrow(/not authenticated/iu);
    expect(resolver).not.toHaveBeenCalled();
    expect(await purchaseJournalCounts(context.database.databaseUrl)).toEqual({
      attempts: "1",
      events: "1",
      jobs: "1",
    });
  } finally {
    await purchase.close();
  }
});
