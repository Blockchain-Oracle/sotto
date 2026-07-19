import { afterAll, beforeAll, expect, expectTypeOf, it } from "vitest";
import {
  createHumanReconciliationRepositoryRuntime,
  type HumanReconciliationRepository,
} from "@sotto/database";
import { createPurchaseTestRuntime } from "../../database/test/purchase-postgres.fixtures.js";
import {
  createExecutionStartedAttempt,
  readReconciliationOffset,
} from "../../database/test/human-reconciliation.postgres.fixture.js";
import { reconciliationJobState } from "../../database/test/human-reconciliation-lease.postgres.fixture.js";
import { terminalSnapshot } from "../../database/test/human-reconciliation-fence-state.postgres.fixture.js";
import type { HumanReconciliationWorkerDependencies } from "../src/index.js";
import { createBoundedLocalReconciliationEndpoint } from "./human-reconciliation-http.postgres.fixture.js";
import {
  reconciliationDeferred,
  startReconciliationChild,
  withinReconciliationTest,
} from "./human-reconciliation-process.postgres.fixture.js";
import { runReconciliationProcessRecovery } from "./human-reconciliation-worker-recovery.postgres.fixture.js";

type TestRuntime = Awaited<ReturnType<typeof createPurchaseTestRuntime>>;
let context: TestRuntime;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_reconciliation_worker");
});

afterAll(async () => context?.database.drop());

it("boots a database-only repository with no payment authority", async () => {
  expectTypeOf<keyof HumanReconciliationRepository>().toEqualTypeOf<
    | "claimHumanReconciliation"
    | "deferHumanReconciliation"
    | "completeHumanReconciliation"
  >();
  expectTypeOf<keyof HumanReconciliationWorkerDependencies>().toEqualTypeOf<
    "repository" | "readReconciliation"
  >();
  const runtime = createHumanReconciliationRepositoryRuntime({
    databaseUrl: context.database.databaseUrl,
    maxConnections: 1,
  });
  try {
    expect(Object.keys(runtime).sort()).toEqual(["close", "repository"]);
    expect(Object.keys(runtime.repository).sort()).toEqual([
      "claimHumanReconciliation",
      "completeHumanReconciliation",
      "deferHumanReconciliation",
    ]);
  } finally {
    await runtime.close();
  }
});

it("gives one child winner, releases its one-connection pool, and requeues pending", async () => {
  const primary = await createExecutionStartedAttempt(context, 580);
  const poolProbe = await createExecutionStartedAttempt(context, 579);
  await primary.purchase.close();
  await poolProbe.purchase.close();
  const started = reconciliationDeferred();
  const release = reconciliationDeferred();
  const endpoint = await createBoundedLocalReconciliationEndpoint(async () => {
    started.resolve();
    await release.promise;
    return { outcome: "pending", scannedThroughOffset: 43 };
  });
  const winner = startReconciliationChild({
    attemptId: primary.initialized.attemptId,
    databaseUrl: context.database.databaseUrl,
    endpoint: endpoint.url,
    leaseOwner: "reconcile-child-a",
    mode: "pool-probe",
    poolProbeAttemptId: poolProbe.initialized.attemptId,
  });
  let loser: ReturnType<typeof startReconciliationChild> | undefined;
  try {
    await withinReconciliationTest(
      started.promise,
      "winner did not reach local HTTP",
    );
    await withinReconciliationTest(
      winner.waitFor("pool-released"),
      "external read retained the PostgreSQL connection",
    );
    loser = startReconciliationChild({
      attemptId: primary.initialized.attemptId,
      databaseUrl: context.database.databaseUrl,
      endpoint: endpoint.url,
      leaseOwner: "reconcile-child-b",
      mode: "normal",
    });
    await expect(
      withinReconciliationTest(loser.result(), "losing child did not finish"),
    ).resolves.toMatchObject({ outcome: "idle" });
    expect(endpoint.requestCount()).toBe(1);

    release.resolve();
    await expect(winner.result()).resolves.toMatchObject({
      outcome: "pending",
      checkpoint: { reconciliationOffset: 43 },
    });
    await expect(
      readReconciliationOffset(context, primary.initialized.attemptId),
    ).resolves.toBe("43");
    await expect(
      reconciliationJobState(context, primary.initialized.attemptId),
    ).resolves.toMatchObject({ generation: "1", owner: null, state: "ready" });
    await expect(
      terminalSnapshot(context, primary.initialized.attemptId),
    ).resolves.toMatchObject({
      attemptState: "execution-started",
      completionOffset: null,
      eventCount: "5",
      eventType: null,
      settlementState: "execution-started",
    });
  } finally {
    release.resolve();
    winner.kill();
    loser?.kill();
    await endpoint.close();
  }
});

it("recovers a killed generation and preserves one committed terminal result", async () =>
  runReconciliationProcessRecovery(context));
