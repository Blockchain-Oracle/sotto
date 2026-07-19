import { randomUUID } from "node:crypto";
import {
  createCatalogProbe,
  type CatalogProbeStore,
} from "@sotto/catalog-probe";
import type { CatalogRepository } from "@sotto/database";
import type { WorkerLoop } from "../supervisor.js";

export const DEFAULT_HEALTH_STALE_MS = 10 * 60 * 1_000;
const CANTON_NETWORK = /^canton:[A-Za-z0-9][A-Za-z0-9._-]*$/u;

export type ProbeLoopInput = Readonly<{
  catalog: CatalogRepository;
  staleMilliseconds?: number;
  now?: () => number;
  observationId?: () => string;
}>;

function probeStore(catalog: CatalogRepository): CatalogProbeStore {
  return Object.freeze({
    findProbeHealthById: (healthObservationId) =>
      catalog.findProbeHealthById(healthObservationId),
    findProviderOriginById: (originId) =>
      catalog.findProviderOriginById(originId),
    recordProbeHealth: (input) => catalog.recordProbeHealth(input),
    recordHealthObservation: (input) => catalog.recordHealthObservation(input),
  });
}

/**
 * Periodic re-probe of published resources. One resource per tick
 * (concurrency 1): the first published resource whose latest health
 * observation is absent or older than the staleness window is re-probed
 * over pinned HTTPS and its health recorded through the catalog
 * repository. Non-GET or non-Canton listings are skipped.
 */
export function createProbeLoop(input: ProbeLoopInput): WorkerLoop {
  const staleMilliseconds = input.staleMilliseconds ?? DEFAULT_HEALTH_STALE_MS;
  if (!Number.isSafeInteger(staleMilliseconds) || staleMilliseconds <= 0) {
    throw new Error("probe staleness window is invalid");
  }
  const now = input.now ?? Date.now;
  const observationId = input.observationId ?? randomUUID;
  const store = probeStore(input.catalog);
  return Object.freeze({
    name: "catalog-probe",
    runStep: async (signal) => {
      const resources = await input.catalog.listPublishedResources();
      for (const resource of resources) {
        if (signal.aborted) return "idle";
        if (resource.method !== "GET") continue;
        if (!CANTON_NETWORK.test(resource.network)) continue;
        const health = await input.catalog.findLatestResourceHealth(
          resource.resourceId,
        );
        if (
          health !== null &&
          now() - Date.parse(health.observedAt) < staleMilliseconds
        ) {
          continue;
        }
        const origin = await input.catalog.findProviderOrigin(
          resource.normalizedOrigin,
        );
        if (origin === null) {
          throw new Error("published resource origin is unavailable");
        }
        const probe = createCatalogProbe({
          expectedNetwork: resource.network as `canton:${string}`,
          store,
        });
        await probe.acquireAndRecord(
          Object.freeze({
            description: resource.description,
            method: "GET" as const,
            name: resource.name,
            observationId: observationId(),
            originId: origin.originId,
            resourceId: resource.resourceId,
            revisionId: resource.resourceRevisionId,
            routeTemplate: resource.routeTemplate,
          }),
          { signal },
        );
        return "progressed";
      }
      return "idle";
    },
  });
}
