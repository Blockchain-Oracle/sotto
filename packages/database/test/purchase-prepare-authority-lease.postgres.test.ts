import { Client, Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { projectHumanPurchaseJournalIntent } from "@sotto/x402-canton";
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

let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_prepare_lease_test");
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

async function jobState(attemptId: string) {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{
      generation: string;
      owner: string | null;
      state: string;
    }>(
      `SELECT lease_generation::text AS generation,
        lease_owner AS owner,
        state
       FROM sotto.outbox_jobs WHERE attempt_id = $1`,
      [attemptId],
    );
    return result.rows[0]!;
  } finally {
    await client.end();
  }
}

it("allows exactly one worker to claim a ready prepare authority", async () => {
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = 598;
    challenge.accepts[0]!.extra.executeBeforeSeconds = 598;
  });
  const first = repository();
  const second = repository();
  try {
    const created = await first.initializeHumanPurchaseAttempt(intent);
    let resolverStarted!: () => void;
    let releaseResolver!: () => void;
    const started = new Promise<void>((resolve) => (resolverStarted = resolve));
    const blocked = new Promise<void>((resolve) => (releaseResolver = resolve));
    let resolverLease: unknown;
    const resolver = vi.fn(
      async (_purchase: unknown, _scope: unknown, lease: unknown) => {
        resolverLease = lease;
        resolverStarted();
        await blocked;
        return freshHumanPrepareAuthority(intent);
      },
    );

    const firstClaim = first.claimHumanPrepareAuthority({
      leaseOwner: "worker-a",
      resolve: resolver,
    });
    await started;
    const secondClaim = await second.claimHumanPrepareAuthority({
      leaseOwner: "worker-b",
      resolve: async () => freshHumanPrepareAuthority(intent),
    });
    expect(secondClaim).toBeNull();
    releaseResolver();
    const claims = [await firstClaim, secondClaim];
    const winners = claims.filter((claim) => claim !== null);

    expect(winners).toHaveLength(1);
    expect(winners[0]!.lease).toMatchObject({
      attemptId: created.attemptId,
      leaseGeneration: 1,
    });
    expect(resolverLease).toEqual(winners[0]!.lease);
    expect(await jobState(created.attemptId)).toMatchObject({
      generation: "1",
      state: "leased",
    });
  } finally {
    await first.close();
    await second.close();
  }
});

it("rejects an old lease generation after expiry and reclaim", async () => {
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = 599;
    challenge.accepts[0]!.extra.executeBeforeSeconds = 599;
  });
  const purchase = repository();
  const created = await purchase.initializeHumanPurchaseAttempt(intent);
  await purchase.close();

  const leaseModule = (await import(
    /* @vite-ignore */ new URL(
      "../dist/purchase-prepare-authority-lease.js",
      import.meta.url,
    ).href
  )) as {
    claimPurchasePrepareAuthorityLease(
      pool: Pool,
      input: {
        leaseOwner: string;
        leaseMilliseconds?: number;
        attemptId?: `sha256:${string}`;
      },
    ): Promise<unknown>;
  };
  const restoreModule = (await import(
    /* @vite-ignore */ new URL(
      "../dist/purchase-prepare-authority-restore.js",
      import.meta.url,
    ).href
  )) as {
    restorePurchasePrepareAuthority(
      pool: Pool,
      keyring: unknown,
      lease: unknown,
      resolve: unknown,
    ): Promise<unknown>;
  };
  const pool = new Pool({ connectionString: context.database.databaseUrl });
  try {
    const firstLease = await leaseModule.claimPurchasePrepareAuthorityLease(
      pool,
      {
        leaseOwner: "worker-a",
        leaseMilliseconds: 30_000,
        attemptId: created.attemptId,
      },
    );
    expect(firstLease).not.toBeNull();
    await pool.query(
      `UPDATE sotto.outbox_jobs
       SET claimed_at = transaction_timestamp() - interval '31 seconds',
        lease_expires_at = transaction_timestamp() - interval '1 second'
       WHERE attempt_id = $1`,
      [created.attemptId],
    );
    const secondLease = await leaseModule.claimPurchasePrepareAuthorityLease(
      pool,
      {
        leaseOwner: "worker-b",
        leaseMilliseconds: 30_000,
        attemptId: created.attemptId,
      },
    );

    await expect(
      restoreModule.restorePurchasePrepareAuthority(
        pool,
        testPrepareAuthorityKeyring(context.runtime),
        firstLease,
        async () => freshHumanPrepareAuthority(intent),
      ),
    ).rejects.toThrow(/purchase persistence/iu);
    const restored = await restoreModule.restorePurchasePrepareAuthority(
      pool,
      testPrepareAuthorityKeyring(context.runtime),
      secondLease,
      async () => freshHumanPrepareAuthority(intent),
    );
    expect(projectHumanPurchaseJournalIntent(restored as never)).toEqual(
      projectHumanPurchaseJournalIntent(intent),
    );
  } finally {
    await pool.end();
  }
});
