import { createHash } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PurchaseRepository } from "../src/index.js";
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

type TransitionResult = Readonly<{
  outcome: "created" | "replayed";
  state: string;
}>;

type ExecutionRepository = PurchaseRepository &
  Readonly<{
    recordHumanApprovalRequested(input: {
      attemptId: string;
      preparedTransactionHash: string;
      connectorId: string;
      connectorKind: "wallet-sdk";
      sessionId: string;
    }): Promise<TransitionResult>;
    recordHumanWalletDecision(input: {
      attemptId: string;
      preparedTransactionHash: string;
      connectorId: string;
      connectorKind: "wallet-sdk";
      outcome: "rejected" | "unsupported";
      reason: string;
      sessionId?: string;
    }): Promise<TransitionResult>;
    recordHumanSignatureVerified(input: {
      attemptId: string;
      preparedTransactionHash: string;
      connectorId: string;
      connectorKind: "wallet-sdk";
      sessionId: string;
      verifiedAt: string;
    }): Promise<TransitionResult>;
    beginHumanExecution(input: {
      attemptId: string;
      commandId: string;
      preparedTransactionHash: string;
      sessionId: string;
      submissionId: string;
      userId: string;
    }): Promise<TransitionResult>;
    readHumanPurchaseLifecycle(attemptId: string): Promise<unknown>;
  }>;

const CONNECTOR = "sotto-reference-wallet";
const SUBMISSION = "018f3f24-7d4a-7e2c-a421-0f3473b99001";
let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_human_execution_lifecycle");
});

afterAll(async () => context?.database.drop());

function repository(): ExecutionRepository {
  return context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(context.runtime),
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: purchaseBindingResolver(),
  }) as ExecutionRepository;
}

async function preparedAttempt(windowSeconds: number) {
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = windowSeconds;
    challenge.accepts[0]!.extra.executeBeforeSeconds = windowSeconds;
  });
  const purchase = repository();
  const initialized = await purchase.initializeHumanPurchaseAttempt(intent);
  const claim = await purchase.claimHumanPrepareAuthority({
    leaseOwner: `execution-worker-${windowSeconds}`,
    leaseMilliseconds: 60_000,
    resolve: async () => freshHumanPrepareAuthority(intent),
  });
  const prepared = await verifiedHumanPrepare(claim!.intent);
  await purchase.completeHumanPrepare({ lease: claim!.lease, prepared });
  return { initialized, prepared, purchase };
}

function approvalInput(attemptId: string, preparedTransactionHash: string) {
  const sessionId = `sha256:${createHash("sha256")
    .update(`wallet-session:${attemptId}`, "utf8")
    .digest("hex")}`;
  return {
    attemptId,
    preparedTransactionHash,
    connectorId: CONNECTOR,
    connectorKind: "wallet-sdk" as const,
    sessionId,
  };
}

it("serializes concurrent approval writers and rejects conflicting replay", async () => {
  const first = await preparedAttempt(596);
  const second = repository();
  try {
    const input = approvalInput(
      first.initialized.attemptId,
      first.prepared.preparedTransactionHash,
    );
    const outcomes = await Promise.all([
      first.purchase.recordHumanApprovalRequested(input),
      second.recordHumanApprovalRequested(input),
    ]);
    expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual([
      "created",
      "replayed",
    ]);
    await expect(
      second.recordHumanApprovalRequested({
        ...input,
        sessionId: `sha256:${"b".repeat(64)}`,
      }),
    ).rejects.toMatchObject({ code: "PURCHASE_CONFLICT" });
    await expect(
      second.recordHumanApprovalRequested({
        ...input,
        connectorId: "other-wallet",
      }),
    ).rejects.toMatchObject({ code: "PURCHASE_CONFLICT" });
    await expect(
      second.recordHumanApprovalRequested({
        ...input,
        preparedTransactionHash: `sha256:${"e".repeat(64)}`,
      }),
    ).rejects.toMatchObject({ code: "PURCHASE_CONFLICT" });
  } finally {
    await first.purchase.close();
    await second.close();
  }
});

it("makes rejection and unsupported decisions terminal", async () => {
  const rejected = await preparedAttempt(595);
  const unsupported = await preparedAttempt(594);
  try {
    const rejection = approvalInput(
      rejected.initialized.attemptId,
      rejected.prepared.preparedTransactionHash,
    );
    await rejected.purchase.recordHumanApprovalRequested(rejection);
    await expect(
      rejected.purchase.recordHumanWalletDecision({
        attemptId: rejection.attemptId,
        preparedTransactionHash: rejection.preparedTransactionHash,
        connectorId: rejection.connectorId,
        connectorKind: rejection.connectorKind,
        outcome: "unsupported",
        reason: "unsupported-network",
      }),
    ).rejects.toMatchObject({ code: "PURCHASE_CONFLICT" });
    await expect(
      rejected.purchase.recordHumanWalletDecision({
        ...rejection,
        outcome: "rejected",
        reason: "user-rejected",
      }),
    ).resolves.toMatchObject({ state: "wallet-rejected" });
    await expect(
      rejected.purchase.recordHumanSignatureVerified({
        ...rejection,
        verifiedAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: "PURCHASE_CONFLICT" });

    await expect(
      unsupported.purchase.recordHumanWalletDecision({
        attemptId: unsupported.initialized.attemptId,
        preparedTransactionHash: unsupported.prepared.preparedTransactionHash,
        connectorId: CONNECTOR,
        connectorKind: "wallet-sdk",
        outcome: "unsupported",
        reason: "unsupported-network",
      }),
    ).resolves.toMatchObject({ state: "wallet-unsupported" });
  } finally {
    await rejected.purchase.close();
    await unsupported.purchase.close();
  }
});

it("commits execution start and one reconcile job before restart", async () => {
  const first = await preparedAttempt(593);
  const second = repository();
  const observer = new Client({
    connectionString: context.database.databaseUrl,
  });
  await observer.connect();
  try {
    const approval = approvalInput(
      first.initialized.attemptId,
      first.prepared.preparedTransactionHash,
    );
    await first.purchase.recordHumanApprovalRequested(approval);
    await first.purchase.recordHumanSignatureVerified({
      ...approval,
      verifiedAt: new Date().toISOString(),
    });
    const execution = {
      attemptId: first.initialized.attemptId,
      commandId: first.initialized.commandId,
      preparedTransactionHash: first.prepared.preparedTransactionHash,
      sessionId: approval.sessionId,
      submissionId: SUBMISSION,
      userId: "validator-devnet-m2m",
    };
    const outcomes = await Promise.all([
      first.purchase.beginHumanExecution(execution),
      second.beginHumanExecution(execution),
    ]);
    expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual([
      "created",
      "replayed",
    ]);
    const durable = await observer.query<{
      events: string;
      jobs: string;
      state: string;
    }>(
      `SELECT attempt.state,
        (SELECT count(*)::text FROM sotto.attempt_events event
          WHERE event.attempt_id = attempt.attempt_id
            AND event.event_type = 'execution-started') AS events,
        (SELECT count(*)::text FROM sotto.outbox_jobs job
          WHERE job.attempt_id = attempt.attempt_id
            AND job.kind = 'purchase-reconcile') AS jobs
       FROM sotto.purchase_attempts attempt WHERE attempt.attempt_id = $1`,
      [first.initialized.attemptId],
    );
    expect(durable.rows).toEqual([
      { events: "1", jobs: "1", state: "execution-started" },
    ]);
    expect(
      await second.readHumanPurchaseLifecycle(first.initialized.attemptId),
    ).toMatchObject({
      state: "execution-started",
      submissionId: SUBMISSION,
    });
    const forbidden = await observer.query<{ columnName: string }>(
      `SELECT column_name AS "columnName" FROM information_schema.columns
       WHERE table_schema = 'sotto'
         AND column_name ~ '(signature|prepared_transaction|wallet_response)'
       ORDER BY column_name, table_name`,
    );
    expect(forbidden.rows).toEqual([
      { columnName: "prepared_transaction_hash" },
      { columnName: "prepared_transaction_hash" },
      { columnName: "signature_verified_at" },
      { columnName: "signature_verified_at" },
    ]);
  } finally {
    await observer.end();
    await first.purchase.close();
    await second.close();
  }
});
