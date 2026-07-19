import {
  createHumanReconciliationRepositoryRuntime,
  type HumanReconciliationRepository,
} from "@sotto/database";
import type {
  HumanReconciliationWorker,
  HumanReconciliationWorkerDependencies,
} from "../src/index.js";
import { createBoundedLocalReconciliationAdapter } from "./human-reconciliation-http-client.postgres.fixture.js";

type WorkerRuntime = Readonly<{
  createHumanReconciliationWorker(
    dependencies: HumanReconciliationWorkerDependencies,
  ): HumanReconciliationWorker;
}>;

function environment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error("reconciliation child environment is incomplete");
  }
  return value;
}

function emit(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main(): Promise<void> {
  const databaseUrl = environment("SOTTO_RECONCILIATION_DATABASE_URL");
  const endpoint = environment("SOTTO_RECONCILIATION_ENDPOINT");
  const attemptId = environment("SOTTO_RECONCILIATION_ATTEMPT_ID");
  const leaseOwner = environment("SOTTO_RECONCILIATION_LEASE_OWNER");
  const mode = environment("SOTTO_RECONCILIATION_CHILD_MODE");
  const poolProbeAttemptId = process.env.SOTTO_RECONCILIATION_POOL_PROBE ?? "";
  const database = createHumanReconciliationRepositoryRuntime({
    applicationName: "sotto-reconcile-child",
    databaseUrl,
    maxConnections: 1,
  });
  try {
    let repository: HumanReconciliationRepository = database.repository;
    if (mode === "hang-after-terminal") {
      repository = Object.freeze({
        claimHumanReconciliation: (input) =>
          database.repository.claimHumanReconciliation(input),
        deferHumanReconciliation: (input) =>
          database.repository.deferHumanReconciliation(input),
        completeHumanReconciliation: async (input) => {
          const checkpoint =
            await database.repository.completeHumanReconciliation(input);
          emit({
            event: "checkpoint-committed",
            leaseGeneration: checkpoint.job.leaseGeneration,
          });
          return await new Promise<never>(() => undefined);
        },
      });
    }
    const adapter = createBoundedLocalReconciliationAdapter(endpoint);
    const readReconciliation =
      mode === "pool-probe"
        ? async (...input: Parameters<typeof adapter>) => {
            const externalRead = adapter(...input);
            const claim = await database.repository.claimHumanReconciliation({
              attemptId: poolProbeAttemptId as `sha256:${string}`,
              leaseOwner: `${leaseOwner}-pool-probe`,
              leaseMilliseconds: 60_000,
            });
            if (claim === null) {
              throw new Error("reconciliation pool probe lease is absent");
            }
            await database.repository.deferHumanReconciliation({
              lease: claim.lease,
              expectedReconciliationOffset: claim.scope.reconciliationOffset,
              scannedThroughOffset: claim.scope.reconciliationOffset,
            });
            emit({
              event: "pool-released",
              leaseGeneration: claim.lease.leaseGeneration,
            });
            return await externalRead;
          }
        : adapter;
    const workerRuntime = (await import(
      /* @vite-ignore */ new URL("../dist/index.js", import.meta.url).href
    )) as WorkerRuntime;
    const worker = workerRuntime.createHumanReconciliationWorker({
      repository,
      readReconciliation,
    });
    const result = await worker.runOne({
      attemptId: attemptId as `sha256:${string}`,
      leaseOwner,
    });
    emit({ event: "result", result });
  } finally {
    await database.close();
  }
}

try {
  await main();
} catch (error) {
  emit({
    event: "error",
    code:
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "HUMAN_RECONCILIATION_CHILD_FAILED",
  });
  process.exitCode = 1;
}
