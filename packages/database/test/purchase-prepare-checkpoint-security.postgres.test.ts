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

async function checkpointCounts(attemptId: string) {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{
      authorityRetired: boolean;
      events: string;
      jobState: string;
      settlements: string;
      state: string;
    }>(
      `SELECT attempt.state,
        job.state AS "jobState",
        (authority.retired_at IS NOT NULL) AS "authorityRetired",
        (SELECT count(*)::text FROM sotto.attempt_events event
          WHERE event.attempt_id = attempt.attempt_id) AS events,
        (SELECT count(*)::text FROM sotto.settlements settlement
          WHERE settlement.attempt_id = attempt.attempt_id) AS settlements
       FROM sotto.purchase_attempts attempt
       JOIN sotto.outbox_jobs job ON job.attempt_id = attempt.attempt_id
       JOIN sotto.private_prepare_authorities authority
         ON authority.attempt_id = attempt.attempt_id
       WHERE attempt.attempt_id = $1`,
      [attemptId],
    );
    return result.rows[0];
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

it("rolls back every checkpoint effect when settlement persistence fails", async () => {
  const intent = await purchaseIntent(597);
  const purchase = repository();
  const fault = new Client({ connectionString: context.database.databaseUrl });
  await fault.connect();
  try {
    const initialized = await purchase.initializeHumanPurchaseAttempt(intent);
    const claim = await purchase.claimHumanPrepareAuthority({
      leaseOwner: "prepare-worker-settlement-fault",
      leaseMilliseconds: 60_000,
      resolve: async () => freshHumanPrepareAuthority(intent),
    });
    const prepared = await verifiedHumanPrepare(claim!.intent);
    await fault.query(`CREATE FUNCTION sotto.reject_settlement_checkpoint()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'forced settlement checkpoint failure';
      END $$`);
    await fault.query(`CREATE TRIGGER reject_settlement_checkpoint
      BEFORE INSERT ON sotto.settlements
      FOR EACH ROW EXECUTE FUNCTION sotto.reject_settlement_checkpoint()`);

    await expect(
      purchase.completeHumanPrepare({ lease: claim!.lease, prepared }),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
    expect(await checkpointCounts(initialized.attemptId)).toEqual({
      authorityRetired: false,
      events: "1",
      jobState: "leased",
      settlements: "0",
      state: "intent-created",
    });

    await fault.query(
      "DROP TRIGGER reject_settlement_checkpoint ON sotto.settlements",
    );
    await fault.query("DROP FUNCTION sotto.reject_settlement_checkpoint() ");
    await expect(
      purchase.completeHumanPrepare({ lease: claim!.lease, prepared }),
    ).resolves.toMatchObject({ state: "prepared-hash-verified" });
  } finally {
    await fault.end();
    await purchase.close();
  }
});

it("makes settlement authority immutable and rejects non-canonical storage", async () => {
  const intent = await purchaseIntent(596);
  const purchase = repository();
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  let triggerDisabled = false;
  try {
    const initialized = await purchase.initializeHumanPurchaseAttempt(intent);
    const claim = await purchase.claimHumanPrepareAuthority({
      leaseOwner: "prepare-worker-settlement-integrity",
      leaseMilliseconds: 60_000,
      resolve: async () => freshHumanPrepareAuthority(intent),
    });
    const prepared = await verifiedHumanPrepare(claim!.intent);
    await purchase.completeHumanPrepare({ lease: claim!.lease, prepared });

    await expect(
      client.query(
        `UPDATE sotto.settlements SET expectation_digest = $2
         WHERE attempt_id = $1`,
        [initialized.attemptId, `sha256:${"b".repeat(64)}`],
      ),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      client.query("DELETE FROM sotto.settlements WHERE attempt_id = $1", [
        initialized.attemptId,
      ]),
    ).rejects.toMatchObject({ code: "55000" });

    await client.query("BEGIN");
    await client.query(
      `UPDATE sotto.settlements
       SET state = 'execution-started', submission_id = $2,
         execution_user_id = 'integrity-test',
         execution_started_at = clock_timestamp()
       WHERE attempt_id = $1`,
      [initialized.attemptId, "018f3f24-7d4a-7e2c-a421-0f3473b99044"],
    );
    await client.query("ROLLBACK");

    await client.query(
      "ALTER TABLE sotto.settlements DISABLE TRIGGER settlements_authority_immutable",
    );
    triggerDisabled = true;
    await client.query(
      `UPDATE sotto.settlements SET expectation = expectation || ' '
       WHERE attempt_id = $1`,
      [initialized.attemptId],
    );
    await client.query(
      "ALTER TABLE sotto.settlements ENABLE TRIGGER settlements_authority_immutable",
    );
    triggerDisabled = false;
    await expect(
      purchase.readHumanSettlementExpectation(initialized.attemptId),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
  } finally {
    if (triggerDisabled) {
      await client.query(
        "ALTER TABLE sotto.settlements ENABLE TRIGGER settlements_authority_immutable",
      );
    }
    await client.end();
    await purchase.close();
  }
});
