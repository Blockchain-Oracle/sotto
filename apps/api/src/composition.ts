import pg from "pg";
import {
  createCatalogRepository,
  createPrepareAuthorityKeyring,
  createPrivateDeliveryKeyring,
  createPurchaseRepository,
  type CatalogRepository,
  type PurchaseRepository,
} from "@sotto/database";
import { createChallengeStore } from "./auth/challenge.js";
import { createSessionRepository } from "./auth/session-repository.js";
import type { ApiDependencies } from "./dependencies.js";
import type { ApiEnvironment } from "./env.js";
import { createSignerWalletClient } from "./signer-client.js";
import { createCatalogReads } from "./services/catalog-reads.js";
import { createComposeAssistService } from "./services/compose-assist.js";
import { createFiveNorthIntentAssembler } from "./services/intent-assembly.js";
import { createOpsStore } from "./services/ops-store.js";
import { createOriginProofService } from "./services/origin-proof.js";
import { createProbeService } from "./services/probe-service.js";
import { createPurchaseBindingRegistry } from "./services/purchase-binding.js";
import { createPurchaseInitiation } from "./services/purchase-initiation.js";
import { createPurchaseReads } from "./services/purchase-reads.js";
import { createStatsReads } from "./services/stats-reads.js";

export type ApiRuntime = Readonly<{
  dependencies: ApiDependencies;
  close(): Promise<void>;
}>;

/**
 * Real composition: one PostgreSQL query pool, the catalog and purchase
 * repositories, the signer wallet client, and — when the FIVE_NORTH_* set
 * is present — the live intent assembler. Absent DevNet configuration is
 * carried as `undefined`, which the affected routes answer with an honest
 * 503, never a simulation.
 */
export function createApiRuntime(environment: ApiEnvironment): ApiRuntime {
  const pool = new pg.Pool({
    connectionString: environment.databaseUrl,
    max: 10,
    connectionTimeoutMillis: 10_000,
    query_timeout: 30_000,
    statement_timeout: 30_000,
    application_name: "sotto-api",
  });
  pool.on("error", () => undefined);

  const catalogRepository: CatalogRepository = createCatalogRepository({
    databaseUrl: environment.databaseUrl,
    applicationName: "sotto-api-catalog",
  });
  const binding = createPurchaseBindingRegistry();
  const purchaseRepository: PurchaseRepository = createPurchaseRepository({
    databaseUrl: environment.databaseUrl,
    prepareAuthorityKeyring: createPrepareAuthorityKeyring(
      environment.prepareAuthorityKey,
    ),
    privateDeliveryKeyring: createPrivateDeliveryKeyring(
      environment.deliveryKey,
    ),
    sourceCommit: environment.sourceCommit,
    resolveHumanPurchaseBinding: binding.resolver,
    applicationName: "sotto-api-purchase",
  });
  const signer = createSignerWalletClient({
    baseUrl: environment.signerServiceUrl,
    token: environment.signerServiceToken,
  });
  const catalog = createCatalogReads(pool);

  const dependencies: ApiDependencies = Object.freeze({
    publicAppOrigin: environment.publicAppOrigin,
    sessionSecret: environment.sessionSecret,
    sourceCommit: environment.sourceCommit,
    cantonExplorerBaseUrl: environment.cantonExplorerBaseUrl,
    fiveNorthConfigured: environment.fiveNorth !== undefined,
    opsToken: environment.opsToken,
    sessions: createSessionRepository(pool),
    challenges: createChallengeStore(environment.publicAppOrigin),
    signer,
    catalog,
    catalogRepository,
    purchaseReads: createPurchaseReads(pool),
    lifecycle: purchaseRepository,
    initiation: createPurchaseInitiation({
      catalog,
      binding,
      repository: purchaseRepository,
      assembler:
        environment.fiveNorth === undefined
          ? undefined
          : createFiveNorthIntentAssembler(environment.fiveNorth, signer),
    }),
    probeService: createProbeService(pool, catalogRepository),
    originProof: createOriginProofService(pool, catalogRepository),
    stats: createStatsReads(pool),
    ops: createOpsStore(pool),
    composeAssist:
      environment.openRouterApiKey === undefined
        ? undefined
        : createComposeAssistService({
            apiKey: environment.openRouterApiKey,
            model: environment.composeModel,
          }),
  });

  return Object.freeze({
    dependencies,
    close: async () => {
      await Promise.allSettled([
        purchaseRepository.close(),
        catalogRepository.close(),
        pool.end(),
      ]);
    },
  });
}
