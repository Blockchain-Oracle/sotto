import type { CatalogRepository } from "./catalog-types.js";
import type { CatalogPoolRuntime } from "./catalog-pool.js";
import { recordOriginProof as persistOriginProof } from "./publication-proof.js";
import { recordProbeObservation as persistProbe } from "./publication-probe.js";
import { publishVerifiedResource as persistPublication } from "./publication-publish.js";
import { listPublicResources } from "./publication-public-query.js";
import { findProbeHealthById } from "./resource-health-recovery.js";
import {
  findLatestResourceHealth,
  recordHealthObservation,
  recordProbeHealth,
} from "./resource-health.js";

export type PublicationRepositoryMethods = Pick<
  CatalogRepository,
  | "recordOriginProof"
  | "recordProbeObservation"
  | "recordProbeHealth"
  | "recordHealthObservation"
  | "findLatestResourceHealth"
  | "findProbeHealthById"
  | "publishVerifiedResource"
  | "listPublishedResources"
>;

export function createPublicationMethods(
  runtime: CatalogPoolRuntime,
): PublicationRepositoryMethods {
  const admitted = async <T>(work: () => Promise<T>): Promise<T> => {
    const release = runtime.admit();
    try {
      return await work();
    } finally {
      release();
    }
  };

  return Object.freeze({
    recordOriginProof: (input) =>
      admitted(() => persistOriginProof(runtime.pool, input)),
    recordProbeObservation: (input) =>
      admitted(() => persistProbe(runtime.pool, input)),
    recordProbeHealth: (input) =>
      admitted(() => recordProbeHealth(runtime.pool, input)),
    recordHealthObservation: (input) =>
      admitted(() => recordHealthObservation(runtime.pool, input)),
    findLatestResourceHealth: (resourceId) =>
      admitted(() => findLatestResourceHealth(runtime.pool, resourceId)),
    findProbeHealthById: (healthObservationId) =>
      admitted(() => findProbeHealthById(runtime.pool, healthObservationId)),
    publishVerifiedResource: (input) =>
      admitted(() => persistPublication(runtime.pool, input)),
    listPublishedResources: () =>
      admitted(() => listPublicResources(runtime.pool)),
  });
}
