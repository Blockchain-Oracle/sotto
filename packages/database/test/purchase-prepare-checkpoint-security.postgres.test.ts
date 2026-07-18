import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  catalogHumanPurchaseIntent,
  PURCHASE_SOURCE_COMMIT,
  purchaseBindingResolver,
} from "./purchase-journal.fixtures.js";
import {
  createPurchaseTestRuntime,
  testPrepareAuthorityKeyring,
} from "./purchase-postgres.fixtures.js";
import { freshHumanPrepareAuthority } from "./purchase-prepare-authority.fixture.js";
import { verifiedHumanPrepare } from "./purchase-prepare-checkpoint.fixture.js";

let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime(
    "sotto_prepare_checkpoint_security_test",
  );
});

afterAll(async () => context?.database.drop());

function repository() {
  return context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(context.runtime),
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

async function eventCount(attemptId: string): Promise<number> {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    const found = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM sotto.attempt_events
       WHERE attempt_id = $1`,
      [attemptId],
    );
    return Number(found.rows[0]?.count);
  } finally {
    await client.end();
  }
}

async function expirePrepareLease(attemptId: string): Promise<void> {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    await client.query(
      `UPDATE sotto.outbox_jobs
       SET claimed_at = clock_timestamp() - interval '2 seconds',
         lease_expires_at = clock_timestamp() - interval '1 second'
       WHERE attempt_id = $1 AND state = 'leased'`,
      [attemptId],
    );
  } finally {
    await client.end();
  }
}

it("fences a stale worker after another generation reclaims its lease", async () => {
  const intent = await purchaseIntent(599);
  const first = repository();
  const second = repository();
  try {
    const initialized = await first.initializeHumanPurchaseAttempt(intent);
    const oldClaim = await first.claimHumanPrepareAuthority({
      leaseOwner: "prepare-worker-old",
      leaseMilliseconds: 60_000,
      resolve: async () => freshHumanPrepareAuthority(intent),
    });
    expect(oldClaim).not.toBeNull();
    const oldPrepared = await verifiedHumanPrepare(oldClaim!.intent);
    await expirePrepareLease(initialized.attemptId);
    const newClaim = await second.claimHumanPrepareAuthority({
      leaseOwner: "prepare-worker-new",
      leaseMilliseconds: 60_000,
      resolve: async () => freshHumanPrepareAuthority(intent),
    });
    expect(newClaim?.lease.leaseGeneration).toBe(
      oldClaim!.lease.leaseGeneration + 1,
    );

    await expect(
      first.completeHumanPrepare({
        lease: oldClaim!.lease,
        prepared: oldPrepared,
      }),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
    expect(await eventCount(initialized.attemptId)).toBe(1);

    const newPrepared = await verifiedHumanPrepare(newClaim!.intent);
    await expect(
      second.completeHumanPrepare({
        lease: newClaim!.lease,
        prepared: newPrepared,
      }),
    ).resolves.toMatchObject({ state: "prepared-hash-verified" });
    expect(await eventCount(initialized.attemptId)).toBe(2);
  } finally {
    await first.close();
    await second.close();
  }
});

it("rejects a structural verified-purchase clone without consuming the lease", async () => {
  const intent = await purchaseIntent(598);
  const purchase = repository();
  try {
    const initialized = await purchase.initializeHumanPurchaseAttempt(intent);
    const claim = await purchase.claimHumanPrepareAuthority({
      leaseOwner: "prepare-worker-forgery",
      leaseMilliseconds: 60_000,
      resolve: async () => freshHumanPrepareAuthority(intent),
    });
    const prepared = await verifiedHumanPrepare(claim!.intent);

    await expect(
      purchase.completeHumanPrepare({
        lease: claim!.lease,
        prepared: structuredClone(prepared) as never,
      }),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
    expect(await eventCount(initialized.attemptId)).toBe(1);
    await expect(
      purchase.completeHumanPrepare({ lease: claim!.lease, prepared }),
    ).resolves.toMatchObject({ state: "prepared-hash-verified" });
  } finally {
    await purchase.close();
  }
});
