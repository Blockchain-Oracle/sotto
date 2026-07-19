import { afterAll, beforeAll, expect, it } from "vitest";
import { authenticatedCatalogHumanPurchaseIntent } from "./purchase-authenticated-intent.fixture.js";
import {
  catalogHumanPurchaseIntent,
  humanPurchaseBinding,
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
  context = await createPurchaseTestRuntime("sotto_purchase_conflicts_test");
});

afterAll(async () => context?.database.drop());

function repository(
  binding = humanPurchaseBinding,
  sourceCommit = PURCHASE_SOURCE_COMMIT,
) {
  return context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    privateDeliveryKeyring: testPrivateDeliveryKeyring(context.runtime),
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(context.runtime),
    sourceCommit,
    resolveHumanPurchaseBinding: purchaseBindingResolver(binding),
  });
}

it("rejects trusted-binding drift for the same authenticated purchase", async () => {
  const intent = await catalogHumanPurchaseIntent();
  const original = repository();
  await original.initializeHumanPurchaseAttempt(intent);
  await original.close();
  const mutations = [
    {
      ...humanPurchaseBinding,
      ownerId: "018f3f24-7d4a-7e2c-a421-0f3473b96991",
    },
    { ...humanPurchaseBinding, beginExclusive: 43 },
  ];
  for (const binding of mutations) {
    const changed = repository(binding);
    try {
      await expect(
        changed.initializeHumanPurchaseAttempt(intent),
      ).rejects.toMatchObject({ code: "PURCHASE_CONFLICT" });
    } finally {
      await changed.close();
    }
  }
  const changedSource = repository(humanPurchaseBinding, "d".repeat(40));
  try {
    await expect(
      changedSource.initializeHumanPurchaseAttempt(intent),
    ).resolves.toMatchObject({
      outcome: "replayed",
      sourceCommit: PURCHASE_SOURCE_COMMIT,
    });
  } finally {
    await changedSource.close();
  }
});

it("allows a request commitment to be reused by a fresh challenge", async () => {
  const purchase = repository();
  const first = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = 599;
    challenge.accepts[0]!.extra.executeBeforeSeconds = 599;
  });
  const second = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = 598;
    challenge.accepts[0]!.extra.executeBeforeSeconds = 598;
  });
  try {
    expect(second.request.requestCommitment).toBe(
      first.request.requestCommitment,
    );
    expect(second.challenge.challengeId).not.toBe(first.challenge.challengeId);
    await expect(
      purchase.initializeHumanPurchaseAttempt(first),
    ).resolves.toMatchObject({ outcome: "created" });
    await expect(
      purchase.initializeHumanPurchaseAttempt(second),
    ).resolves.toMatchObject({ outcome: "created" });
    expect(await purchaseJournalCounts(context.database.databaseUrl)).toEqual({
      attempts: "3",
      authorities: "3",
      events: "3",
      jobs: "3",
    });
  } finally {
    await purchase.close();
  }
});

it("rejects a revision that does not match the authenticated route", async () => {
  const intent = await authenticatedCatalogHumanPurchaseIntent(
    "https://weather.example.com/not-the-selected-resource",
  );
  const purchase = context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    privateDeliveryKeyring: testPrivateDeliveryKeyring(context.runtime),
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(context.runtime),
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: async () => humanPurchaseBinding,
  });
  try {
    await expect(
      purchase.initializeHumanPurchaseAttempt(intent),
    ).rejects.toMatchObject({ code: "PURCHASE_CONFLICT" });
  } finally {
    await purchase.close();
  }
});
