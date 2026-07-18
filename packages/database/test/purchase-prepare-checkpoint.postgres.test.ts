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
  context = await createPurchaseTestRuntime("sotto_prepare_checkpoint_test");
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

async function storedCheckpoint(attemptId: string) {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT attempt.state,
        attempt.prepared_transaction_hash AS "preparedTransactionHash",
        attempt.transfer_context_hash AS "transferContextHash",
        event.sequence::text AS "eventSequence",
        event.event_type AS "eventType",
        event.previous_event_hash AS "previousEventHash",
        job.state AS "jobState",
        job.result_event_sequence::text AS "resultEventSequence",
        authority.retired_at AS "authorityRetiredAt"
       FROM sotto.purchase_attempts attempt
       JOIN sotto.attempt_events event
         ON event.attempt_id = attempt.attempt_id AND event.sequence = 2
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

it("atomically checkpoints one authentically verified prepared purchase", async () => {
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = 599;
    challenge.accepts[0]!.extra.executeBeforeSeconds = 599;
  });
  const purchase = repository();
  try {
    const initialized = await purchase.initializeHumanPurchaseAttempt(intent);
    const claimed = await purchase.claimHumanPrepareAuthority({
      leaseOwner: "prepare-worker-a",
      leaseMilliseconds: 60_000,
      resolve: async () => freshHumanPrepareAuthority(intent),
    });
    expect(claimed).not.toBeNull();
    const verified = await verifiedHumanPrepare(claimed!.intent);

    const checkpoint = await purchase.completeHumanPrepare({
      lease: claimed!.lease,
      prepared: verified,
    });

    expect(checkpoint).toMatchObject({
      attemptId: initialized.attemptId,
      outcome: "prepared-hash-verified",
      preparedTransactionHash: verified.preparedTransactionHash,
      state: "prepared-hash-verified",
      event: { sequence: 2, type: "prepared-hash-verified" },
      job: { jobId: claimed!.lease.jobId, state: "completed" },
    });
    expect(await storedCheckpoint(initialized.attemptId)).toMatchObject({
      authorityRetiredAt: expect.any(Date),
      eventSequence: "2",
      eventType: "prepared-hash-verified",
      jobState: "completed",
      preparedTransactionHash: verified.preparedTransactionHash,
      resultEventSequence: "2",
      state: "prepared-hash-verified",
    });
    await expect(
      purchase.claimHumanPrepareAuthority({
        leaseOwner: "prepare-worker-b",
        resolve: async () => freshHumanPrepareAuthority(intent),
      }),
    ).resolves.toBeNull();
  } finally {
    await purchase.close();
  }
});
