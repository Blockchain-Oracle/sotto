import { pathToFileURL } from "node:url";
import pg from "pg";
import {
  createCatalogRepository,
  createHumanReconciliationRepositoryRuntime,
  createPrepareAuthorityKeyring,
  createPrivateDeliveryKeyring,
  createPurchaseRepository,
} from "@sotto/database";
import { readWorkerEnvironment, type WorkerEnvironment } from "./env.js";
import { createHeartbeatLoop, createWorkerHeartbeat } from "./heartbeat.js";
import { createSignerClient } from "./signer-client.js";
import { runSupervisor, type WorkerLoop } from "./supervisor.js";
import { createPrepareLoop } from "./loops/prepare-loop.js";
import { createProbeLoop } from "./loops/probe-loop.js";
import { createReconciliationLoop } from "./loops/reconciliation-loop.js";

export const WORKER_HEARTBEAT_KIND = "sotto-worker";

export type WorkerLogEntry = Readonly<Record<string, unknown>>;

export type RunWorkerOptions = Readonly<{
  signal?: AbortSignal;
  log?: (entry: WorkerLogEntry) => void;
}>;

function defaultLog(entry: WorkerLogEntry): void {
  process.stdout.write(
    `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
  );
}

function composeLoops(
  environment: WorkerEnvironment,
  repositories: Readonly<{
    purchase: ReturnType<typeof createPurchaseRepository>;
    reconciliation: ReturnType<
      typeof createHumanReconciliationRepositoryRuntime
    >;
    catalog: ReturnType<typeof createCatalogRepository>;
    heartbeatPool: pg.Pool;
  }>,
  log: (entry: WorkerLogEntry) => void,
  startedAt: string,
): ReadonlyArray<WorkerLoop> {
  const signer = createSignerClient({
    baseUrl: environment.signerServiceUrl,
    token: environment.signerServiceToken,
  });
  return Object.freeze([
    createHeartbeatLoop(
      createWorkerHeartbeat({
        client: repositories.heartbeatPool,
        workerId: environment.leaseOwner,
        kind: WORKER_HEARTBEAT_KIND,
        sourceCommit: environment.sourceCommit,
        startedAt,
      }),
    ),
    createPrepareLoop(
      {
        network: environment.network,
        repository: repositories.purchase,
        signer,
        leaseOwner: environment.leaseOwner,
        humanWalletPublicKeys: environment.humanWalletPublicKeys,
      },
      (outcome) => log({ code: "WORKER_EXECUTION_OUTCOME", ...outcome }),
    ),
    createReconciliationLoop({
      network: environment.network,
      repository: repositories.reconciliation.repository,
      leaseOwner: environment.leaseOwner,
    }),
    createProbeLoop({ catalog: repositories.catalog }),
  ]);
}

/**
 * The one restartable Sotto worker process (Q-006): composes real
 * PostgreSQL repositories, real Five North transports, and the
 * signer-service client into supervised prepare, execution, reconciliation,
 * probe, and heartbeat loops. Resolves after the abort signal fires and
 * every loop and pool has drained. Performs no I/O at import time.
 */
export async function runWorker(
  environmentSource: Readonly<Record<string, string | undefined>> = process.env,
  options: RunWorkerOptions = {},
): Promise<void> {
  const environment = readWorkerEnvironment(environmentSource);
  const log = options.log ?? defaultLog;
  const controller = new AbortController();
  if (options.signal !== undefined) {
    if (options.signal.aborted) controller.abort();
    else
      options.signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
  }
  const onOperationalError = (event: Readonly<{ code: string }>) =>
    log({ code: event.code });
  const purchase = createPurchaseRepository({
    databaseUrl: environment.databaseUrl,
    prepareAuthorityKeyring: createPrepareAuthorityKeyring(
      environment.prepareAuthorityKey,
    ),
    privateDeliveryKeyring: createPrivateDeliveryKeyring(
      environment.privateDeliveryKey,
    ),
    sourceCommit: environment.sourceCommit,
    resolveHumanPurchaseBinding: async () => {
      throw new Error("the worker never initializes purchase attempts");
    },
    onOperationalError,
  });
  const reconciliation = createHumanReconciliationRepositoryRuntime({
    databaseUrl: environment.databaseUrl,
    onOperationalError,
  });
  const catalog = createCatalogRepository({
    databaseUrl: environment.databaseUrl,
    onOperationalError,
  });
  const heartbeatPool = new pg.Pool({
    connectionString: environment.databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
    statement_timeout: 10_000,
    application_name: "sotto-worker-heartbeat",
  });
  heartbeatPool.on("error", () => log({ code: "WORKER_HEARTBEAT_POOL_ERROR" }));
  try {
    log({ code: "WORKER_STARTED", leaseOwner: environment.leaseOwner });
    await runSupervisor(
      composeLoops(
        environment,
        { purchase, reconciliation, catalog, heartbeatPool },
        log,
        new Date().toISOString(),
      ),
      { signal: controller.signal, onEvent: (event) => log({ ...event }) },
    );
  } finally {
    await Promise.allSettled([
      purchase.close(),
      reconciliation.close(),
      catalog.close(),
      heartbeatPool.end(),
    ]);
    log({ code: "WORKER_STOPPED" });
  }
}

const executedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (executedDirectly) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  runWorker(process.env, { signal: controller.signal }).then(
    () => process.exit(0),
    (error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "worker failed"}\n`,
      );
      process.exit(1);
    },
  );
}
