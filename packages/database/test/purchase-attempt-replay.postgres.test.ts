import { afterAll, beforeAll, expect, it } from "vitest";
import {
  catalogHumanPurchaseIntent,
  PURCHASE_SOURCE_COMMIT,
  purchaseBindingResolver,
} from "./purchase-journal.fixtures.js";
import {
  createPurchaseTestRuntime,
  purchaseJournalCounts,
  testPrepareAuthorityKeyring,
} from "./purchase-postgres.fixtures.js";
import { freshHumanPrepareAuthority } from "./purchase-prepare-authority.fixture.js";
import { verifiedHumanPrepare } from "./purchase-prepare-checkpoint.fixture.js";

let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_purchase_replay_test");
});

afterAll(async () => context?.database.drop());

function repository(marker = 7, keyId = "prepare-key-2026-07") {
  return context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(
      context.runtime,
      marker,
      keyId,
    ),
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: purchaseBindingResolver(),
  });
}

async function purchaseIntent(windowSeconds: number) {
  return catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = windowSeconds;
    challenge.accepts[0]!.extra.executeBeforeSeconds = windowSeconds;
  });
}

it("honestly replays an in-progress leased attempt", async () => {
  const intent = await purchaseIntent(599);
  const purchase = repository();
  try {
    await purchase.initializeHumanPurchaseAttempt(intent);
    const claim = await purchase.claimHumanPrepareAuthority({
      leaseOwner: "prepare-worker-replay",
      leaseMilliseconds: 60_000,
      resolve: async () => freshHumanPrepareAuthority(intent),
    });

    await expect(
      purchase.initializeHumanPurchaseAttempt(intent),
    ).resolves.toMatchObject({
      outcome: "replayed",
      state: "intent-created",
      job: {
        state: "leased",
        leaseGeneration: claim!.lease.leaseGeneration,
        leaseOwner: claim!.lease.leaseOwner,
        leaseExpiresAt: claim!.lease.leaseExpiresAt,
        claimedAt: claim!.lease.claimedAt,
      },
    });
  } finally {
    await purchase.close();
  }
});

it("replays a checkpoint after restart without its retired encryption key", async () => {
  const intent = await purchaseIntent(598);
  let prepared: Awaited<ReturnType<typeof verifiedHumanPrepare>>;
  let transferContextHash: string;
  const original = repository();
  try {
    await original.initializeHumanPurchaseAttempt(intent);
    const claim = await original.claimHumanPrepareAuthority({
      leaseOwner: "prepare-worker-terminal-replay",
      leaseMilliseconds: 60_000,
      resolve: async () => freshHumanPrepareAuthority(intent),
    });
    prepared = await verifiedHumanPrepare(claim!.intent);
    const checkpoint = await original.completeHumanPrepare({
      lease: claim!.lease,
      prepared,
    });
    transferContextHash = checkpoint.transferContextHash;
  } finally {
    await original.close();
  }

  const restarted = repository(19, "replacement-key-without-retired-key");
  try {
    await expect(
      restarted.initializeHumanPurchaseAttempt(intent),
    ).resolves.toMatchObject({
      outcome: "replayed",
      state: "prepared-hash-verified",
      prepared: {
        preparedTransactionHash: prepared!.preparedTransactionHash,
        transferContextHash: transferContextHash!,
        verifiedAt: prepared!.verifiedAt,
      },
      event: { sequence: 2, type: "prepared-hash-verified" },
      job: { state: "completed", resultEventSequence: 2 },
    });
    expect(await purchaseJournalCounts(context.database.databaseUrl)).toEqual({
      attempts: "2",
      authorities: "2",
      events: "3",
      jobs: "2",
    });
  } finally {
    await restarted.close();
  }
});
