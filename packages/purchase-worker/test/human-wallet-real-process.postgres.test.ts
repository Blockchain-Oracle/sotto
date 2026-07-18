import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { PurchaseRepository } from "@sotto/database";
import { claimVerifiedHumanWalletSigningSession } from "@sotto/x402-canton/internal/human-wallet-signing-session";
import {
  createPurchaseTestRuntime,
  humanExecutionFenceCounts,
  testPrepareAuthorityKeyring,
} from "../../database/test/purchase-postgres.fixtures.js";
import {
  PURCHASE_SOURCE_COMMIT,
  purchaseBindingResolver,
} from "../../database/test/purchase-journal.fixtures.js";
import {
  createHumanPrepareWorker,
  createHumanWalletExecutionWorker,
} from "../src/index.js";
import {
  createBoundedLocalExecuteEndpoint,
  createRealWalletProcessFixture,
  realWalletPurchaseContext,
  recomputeRealWalletPreparedHash,
} from "../../../spikes/capability-wallet/test/human-wallet-worker-process.postgres.fixture.js";

const EXECUTION_USER_ID = "local-wallet-integration-user";
let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_real_wallet_process");
});

afterAll(async () => context?.database.drop());

function repository(): PurchaseRepository {
  return context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(context.runtime),
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: purchaseBindingResolver(),
    maxConnections: 1,
  });
}

it("executes one compiled Wallet SDK approval behind the durable PostgreSQL fence", async () => {
  const wallet = await createRealWalletProcessFixture();
  const purchase = repository();
  let closeEndpoint: (() => Promise<void>) | undefined;
  try {
    const setup = await realWalletPurchaseContext(wallet);
    await purchase.initializeHumanPurchaseAttempt(setup.intent);
    const prepared = await createHumanPrepareWorker({
      repository: purchase,
      resolveAuthority: async () => setup.createAuthority(),
      createReaders: () => setup.readers,
      recomputeOfficialHash: recomputeRealWalletPreparedHash,
    }).runOne({ leaseOwner: "real-wallet-process-integration" });
    if (prepared.outcome !== "prepared-hash-verified") {
      throw new Error("real wallet prepare handoff is absent");
    }

    const endpoint = await createBoundedLocalExecuteEndpoint(() =>
      purchase.readHumanPurchaseLifecycle(prepared.approval.attemptId),
    );
    closeEndpoint = endpoint.close;
    const resolveRegisteredPublicKey = vi.fn(async () => wallet.registeredKey);
    const worker = createHumanWalletExecutionWorker({
      repository: purchase,
      resolveRegisteredPublicKey,
      executeTransport: {
        createDispatch: async (verified) => {
          const material = claimVerifiedHumanWalletSigningSession(verified);
          const submissionId = randomUUID();
          return {
            preparedTransactionHash: material.preparedTransactionHash,
            sessionId: material.sessionId,
            submissionId,
            userId: EXECUTION_USER_ID,
            execute: async ({ signal }) => {
              const source = JSON.stringify({
                preparedTransaction: Buffer.from(
                  material.preparedTransaction,
                ).toString("base64"),
                hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
                submissionId,
                userId: EXECUTION_USER_ID,
                partySignatures: {
                  signatures: [
                    {
                      party: material.signature.party,
                      signatures: [material.signature],
                    },
                  ],
                },
              });
              const result = await fetch(endpoint.url, {
                method: "POST",
                body: source,
                headers: { "content-type": "application/json" },
                redirect: "error",
                signal: AbortSignal.any([
                  signal ?? new AbortController().signal,
                  AbortSignal.timeout(5_000),
                ]),
              });
              if (!result.ok) throw new Error("local execute failed");
              await result.arrayBuffer();
              return {
                outcome: "submitted" as const,
                preparedTransactionHash: material.preparedTransactionHash,
              };
            },
          };
        },
      },
    });

    await expect(worker.runOne({ prepared })).resolves.toMatchObject({
      outcome: "execution-submitted",
      userId: EXECUTION_USER_ID,
    });
    expect(wallet.approvalCalls()).toBe(1);
    expect(resolveRegisteredPublicKey).toHaveBeenCalledOnce();
    expect(endpoint.executeCalls()).toBe(1);
    expect(endpoint.fenceObserved()).toBe(true);
    expect(endpoint.receivedSignature()).toBe(true);
    expect(wallet.processOutput()).toMatch(/\{"outcome":"approved"\}\s*$/u);
    expect(wallet.processOutputIsRedacted()).toBe(true);

    await purchase.close();
    const reopened = repository();
    const secondSigning = vi.fn(async () => {
      throw new Error("restart must not request wallet approval");
    });
    const secondDispatch = vi.fn(async () => {
      throw new Error("restart must not create an execution dispatch");
    });
    try {
      await expect(
        reopened.readHumanPurchaseLifecycle(prepared.approval.attemptId),
      ).resolves.toMatchObject({
        state: "execution-started",
        userId: EXECUTION_USER_ID,
      });
      const recovered = createHumanWalletExecutionWorker({
        repository: reopened,
        createSigningSession: secondSigning,
        resolveRegisteredPublicKey: vi.fn(async () => {
          throw new Error("restart must not resolve a wallet key");
        }),
        executeTransport: { createDispatch: secondDispatch },
      });
      await expect(recovered.runOne({ prepared })).resolves.toMatchObject({
        outcome: "reconciliation-only",
        userId: EXECUTION_USER_ID,
      });
      expect(secondSigning).not.toHaveBeenCalled();
      expect(secondDispatch).not.toHaveBeenCalled();
      expect(wallet.approvalCalls()).toBe(1);
      expect(endpoint.executeCalls()).toBe(1);
      await expect(
        humanExecutionFenceCounts(
          context.database.databaseUrl,
          prepared.approval.attemptId,
        ),
      ).resolves.toEqual({ events: "1", jobs: "1" });
    } finally {
      await reopened.close();
    }
  } finally {
    await closeEndpoint?.();
    await wallet.cleanup();
    await purchase.close();
  }
});
