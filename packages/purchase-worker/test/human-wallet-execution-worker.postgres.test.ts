import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { PurchaseRepository } from "@sotto/database";
import {
  catalogHumanPurchaseIntent,
  PURCHASE_SOURCE_COMMIT,
  purchaseBindingResolver,
} from "../../database/test/purchase-journal.fixtures.js";
import {
  createPurchaseTestRuntime,
  testPrivateDeliveryKeyring,
  testPrepareAuthorityKeyring,
} from "../../database/test/purchase-postgres.fixtures.js";
import { freshHumanPrepareAuthority } from "../../database/test/purchase-prepare-authority.fixture.js";
import type { HumanPrepareWorkerDependencies } from "../src/index.js";
import {
  humanPrepareReaders,
  officialHash,
} from "./human-prepare-worker.fixtures.js";
import {
  EXECUTION_USER_ID,
  rejectedSigningResult,
  SUBMISSION_ID,
  verifiedSigningResult,
  type PreparedWorkerResult,
} from "./human-wallet-execution-worker.fixtures.js";

function sessionId(prepared: PreparedWorkerResult): `sha256:${string}` {
  return `sha256:${prepared.approval.attemptId.slice(7)}`;
}

let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;
let workerRuntime: Readonly<{
  createHumanPrepareWorker(input: HumanPrepareWorkerDependencies): {
    runOne(input: { leaseOwner: string }): Promise<unknown>;
  };
  createHumanWalletExecutionWorker(input: unknown): {
    runOne(input: { prepared: PreparedWorkerResult }): Promise<unknown>;
  };
}>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_human_wallet_execution");
  workerRuntime = (await import(
    /* @vite-ignore */ new URL("../dist/index.js", import.meta.url).href
  )) as typeof workerRuntime;
});

afterAll(async () => context?.database.drop());

function repository(maxConnections = 1): PurchaseRepository {
  return context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    privateDeliveryKeyring: testPrivateDeliveryKeyring(context.runtime),
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(context.runtime),
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: purchaseBindingResolver(),
    maxConnections,
  });
}

async function preparedAttempt(
  purchase: PurchaseRepository,
  windowSeconds: number,
): Promise<PreparedWorkerResult> {
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = windowSeconds;
    challenge.accepts[0]!.extra.executeBeforeSeconds = windowSeconds;
  });
  await purchase.initializeHumanPurchaseAttempt(intent);
  const prepared = await workerRuntime
    .createHumanPrepareWorker({
      repository: purchase,
      resolveAuthority: async () => freshHumanPrepareAuthority(intent),
      createReaders: () => humanPrepareReaders(intent),
      recomputeOfficialHash: officialHash,
    })
    .runOne({ leaseOwner: `wallet-execution-${windowSeconds}` });
  if (
    typeof prepared !== "object" ||
    prepared === null ||
    !("outcome" in prepared) ||
    prepared.outcome !== "prepared-hash-verified"
  ) {
    throw new Error("PostgreSQL prepare handoff is absent");
  }
  return prepared as PreparedWorkerResult;
}

it("keeps a one-connection pool available while wallet approval waits", async () => {
  const purchase = repository();
  const prepared = await preparedAttempt(purchase, 592);
  const walletSessionId = sessionId(prepared);
  let started!: () => void;
  let release!: () => void;
  const connectorStarted = new Promise<void>((resolve) => (started = resolve));
  const connectorReleased = new Promise<void>((resolve) => (release = resolve));
  const createDispatch = vi.fn();
  try {
    const worker = workerRuntime.createHumanWalletExecutionWorker({
      repository: purchase,
      createSigningSession: async (
        _input: unknown,
        _dependencies: unknown,
        options: {
          onApprovalRequested?: (value: unknown) => Promise<void>;
        },
      ) => {
        await options.onApprovalRequested?.({
          connectorId: "sotto-reference-wallet",
          connectorKind: "wallet-sdk",
          sessionId: walletSessionId,
        });
        started();
        await connectorReleased;
        return rejectedSigningResult(walletSessionId);
      },
      resolveRegisteredPublicKey: vi.fn(),
      executeTransport: { createDispatch },
    });
    const run = worker.runOne({ prepared });
    await connectorStarted;

    const lifecycle = await Promise.race([
      purchase.readHumanPurchaseLifecycle(prepared.approval.attemptId),
      delay(2_000).then(() => {
        throw new Error("wallet wait retained the PostgreSQL connection");
      }),
    ]);
    expect(lifecycle.state).toBe("approval-requested");
    release();
    await expect(run).resolves.toMatchObject({ outcome: "wallet-rejected" });
    expect(createDispatch).not.toHaveBeenCalled();
  } finally {
    release?.();
    await purchase.close();
  }
});

it("commits the reconcile fence before one uncertain execute", async () => {
  const purchase = repository();
  const prepared = await preparedAttempt(purchase, 591);
  const walletSessionId = sessionId(prepared);
  let executeCalls = 0;
  try {
    const worker = workerRuntime.createHumanWalletExecutionWorker({
      repository: purchase,
      createSigningSession: async (
        _input: unknown,
        _dependencies: unknown,
        options: {
          onApprovalRequested?: (value: unknown) => Promise<void>;
        },
      ) => {
        await options.onApprovalRequested?.({
          connectorId: "sotto-reference-wallet",
          connectorKind: "wallet-sdk",
          sessionId: walletSessionId,
        });
        return verifiedSigningResult(prepared, walletSessionId);
      },
      resolveRegisteredPublicKey: vi.fn(),
      executeTransport: {
        createDispatch: async () => ({
          preparedTransactionHash: prepared.approval.preparedTransactionHash,
          sessionId: walletSessionId,
          submissionId: SUBMISSION_ID,
          userId: EXECUTION_USER_ID,
          execute: async () => {
            expect(
              await purchase.readHumanPurchaseLifecycle(
                prepared.approval.attemptId,
              ),
            ).toMatchObject({
              latestEventSequence: 5,
              latestEventType: "execution-started",
              state: "execution-started",
              submissionId: SUBMISSION_ID,
            });
            executeCalls += 1;
            throw new Error("execute response lost");
          },
        }),
      },
    });

    await expect(worker.runOne({ prepared })).resolves.toMatchObject({
      outcome: "execution-uncertain",
      submissionId: SUBMISSION_ID,
    });
    expect(executeCalls).toBe(1);
    expect(
      await purchase.readHumanPurchaseLifecycle(prepared.approval.attemptId),
    ).toMatchObject({
      state: "execution-started",
      submissionId: SUBMISSION_ID,
    });
  } finally {
    await purchase.close();
  }
});
