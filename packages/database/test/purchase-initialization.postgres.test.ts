import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  catalogHumanPurchaseIntent,
  humanPurchaseBinding,
  PURCHASE_SOURCE_COMMIT,
  purchaseBindingResolver,
} from "./purchase-journal.fixtures.js";
import {
  createPurchaseTestRuntime,
  purchaseJournalCounts,
} from "./purchase-postgres.fixtures.js";

let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_purchase_init_test");
});

afterAll(async () => context?.database.drop());

function repository() {
  return context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: purchaseBindingResolver(),
  });
}

describe("durable authenticated human purchase initialization", () => {
  it("atomically creates one attempt, first event, and prepare-only job", async () => {
    const intent = await catalogHumanPurchaseIntent();
    const purchase = repository();
    try {
      const result = await purchase.initializeHumanPurchaseAttempt(intent);
      expect(result).toMatchObject({
        outcome: "created",
        attemptId: intent.attemptId,
        ownerId: humanPurchaseBinding.ownerId,
        resourceRevisionId: humanPurchaseBinding.resourceRevisionId,
        requestCommitment: intent.request.requestCommitment,
        challengeId: intent.challenge.challengeId,
        purchaseCommitment: intent.purchaseCommitment,
        commandId: `sotto-human-purchase-v1-${intent.purchaseCommitment.slice(7)}`,
        authorizationMode: "human-wallet",
        commitmentVersion: "sotto-human-purchase-v1",
        state: "intent-created",
        event: {
          sequence: 1,
          type: "intent-created",
          previousEventHash: null,
        },
        job: { kind: "purchase-prepare", state: "ready" },
      });
      expect(result.event.eventHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
      expect(result.job.dedupeKey).toMatch(/^sha256:[0-9a-f]{64}$/u);
      expect(result.job.jobId).toMatch(/^[0-9a-f-]{36}$/u);
      expect(await purchaseJournalCounts(context.database.databaseUrl)).toEqual(
        {
          attempts: "1",
          events: "1",
          jobs: "1",
        },
      );
    } finally {
      await purchase.close();
    }
  });

  it("recovers the exact aggregate after a repository restart", async () => {
    const intent = await catalogHumanPurchaseIntent((challenge) => {
      challenge.accepts[0]!.maxTimeoutSeconds = 599;
      challenge.accepts[0]!.extra.executeBeforeSeconds = 599;
    });
    const first = repository();
    const created = await first.initializeHumanPurchaseAttempt(intent);
    await first.close();
    const restarted = repository();
    try {
      const replayed = await restarted.initializeHumanPurchaseAttempt(intent);
      expect(replayed).toEqual({ ...created, outcome: "replayed" });
      expect(await purchaseJournalCounts(context.database.databaseUrl)).toEqual(
        {
          attempts: "2",
          events: "2",
          jobs: "2",
        },
      );
    } finally {
      await restarted.close();
    }
  });
});
