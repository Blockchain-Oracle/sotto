import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type {
  HumanPrepareWorker,
  HumanPrepareWorkerDependencies,
} from "../src/index.js";
import {
  createHumanWalletSigningSession,
  HUMAN_WALLET_SIGNING_RESPONSE_VERSION,
} from "@sotto/x402-canton";
import {
  catalogHumanPurchaseIntent,
  PURCHASE_SOURCE_COMMIT,
  purchaseBindingResolver,
} from "../../database/test/purchase-journal.fixtures.js";
import {
  createPurchaseTestRuntime,
  purchaseJournalCounts,
  testPrivateDeliveryKeyring,
  testPrepareAuthorityKeyring,
} from "../../database/test/purchase-postgres.fixtures.js";
import { freshHumanPrepareAuthority } from "../../database/test/purchase-prepare-authority.fixture.js";
import {
  humanPrepareReaders,
  officialHash,
} from "./human-prepare-worker.fixtures.js";

let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;
let workerRuntime: Readonly<{
  createHumanPrepareWorker(
    input: HumanPrepareWorkerDependencies,
  ): HumanPrepareWorker;
}>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_human_prepare_worker_test");
  workerRuntime = (await import(
    /* @vite-ignore */ new URL("../dist/index.js", import.meta.url).href
  )) as typeof workerRuntime;
});

afterAll(async () => context?.database.drop());

function repository(maxConnections?: number) {
  return context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    privateDeliveryKeyring: testPrivateDeliveryKeyring(context.runtime),
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(context.runtime),
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: purchaseBindingResolver(),
    ...(maxConnections === undefined ? {} : { maxConnections }),
  });
}

async function intent(windowSeconds: number) {
  return catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = windowSeconds;
    challenge.accepts[0]!.extra.executeBeforeSeconds = windowSeconds;
  });
}

it("runs the real PostgreSQL prepare checkpoint and becomes idle", async () => {
  const purchaseIntent = await intent(599);
  const purchase = repository();
  const readers = humanPrepareReaders(purchaseIntent);
  const createReaders = vi.fn(() => readers);
  const approvalRequests: unknown[] = [];
  try {
    await purchase.initializeHumanPurchaseAttempt(purchaseIntent);
    const worker = workerRuntime.createHumanPrepareWorker({
      repository: purchase,
      resolveAuthority: async () =>
        freshHumanPrepareAuthority(purchaseIntent, async (candidate) => {
          const request = candidate as Readonly<{ sessionId: string }>;
          approvalRequests.push(candidate);
          return {
            version: HUMAN_WALLET_SIGNING_RESPONSE_VERSION,
            outcome: "rejected",
            reason: "user-rejected",
            sessionId: request.sessionId,
          };
        }),
      createReaders,
      recomputeOfficialHash: officialHash,
    });

    const prepared = await worker.runOne({
      leaseOwner: "postgres-prepare-worker",
    });
    expect(prepared).toMatchObject({
      outcome: "prepared-hash-verified",
      checkpoint: { state: "prepared-hash-verified" },
      approval: { attemptId: purchaseIntent.attemptId },
    });
    if (prepared.outcome !== "prepared-hash-verified") {
      throw new Error("PostgreSQL worker did not return its wallet handoff");
    }
    await expect(
      createHumanWalletSigningSession(prepared.handoff, {
        resolveRegisteredPublicKey: vi.fn(),
      }),
    ).resolves.toMatchObject({ outcome: "rejected" });
    expect(approvalRequests).toHaveLength(1);
    await expect(
      worker.runOne({ leaseOwner: "postgres-prepare-worker" }),
    ).resolves.toEqual({ outcome: "idle" });
    expect(createReaders).toHaveBeenCalledOnce();
    expect(await purchaseJournalCounts(context.database.databaseUrl)).toEqual({
      attempts: "1",
      authorities: "1",
      events: "2",
      jobs: "1",
    });
  } finally {
    await purchase.close();
  }
});

it("keeps PostgreSQL available while external preparation is blocked", async () => {
  const blockedIntent = await intent(598);
  const independentIntent = await intent(597);
  const purchase = repository(1);
  const readers = humanPrepareReaders(blockedIntent);
  const readLedgerEnd = readers.holdings.readLedgerEnd;
  let started!: () => void;
  let release!: () => void;
  const externalStarted = new Promise<void>((resolve) => (started = resolve));
  const externalReleased = new Promise<void>((resolve) => (release = resolve));
  readers.holdings.readLedgerEnd.mockImplementationOnce(async (options) => {
    started();
    await externalReleased;
    return readLedgerEnd(options);
  });
  try {
    await purchase.initializeHumanPurchaseAttempt(blockedIntent);
    const worker = workerRuntime.createHumanPrepareWorker({
      repository: purchase,
      resolveAuthority: async () => freshHumanPrepareAuthority(blockedIntent),
      createReaders: () => readers,
      recomputeOfficialHash: officialHash,
    });
    const run = worker.runOne({ leaseOwner: "blocked-external-worker" });
    await externalStarted;

    const initialized = await Promise.race([
      purchase.initializeHumanPurchaseAttempt(independentIntent),
      delay(2_000).then(() => {
        throw new Error(
          "independent PostgreSQL work was blocked by network I/O",
        );
      }),
    ]);
    expect(initialized.outcome).toBe("created");
    release();
    await expect(run).resolves.toMatchObject({
      outcome: "prepared-hash-verified",
    });
  } finally {
    release?.();
    await purchase.close();
  }
});
