import type { ResourceHealthInput } from "@sotto/database";
import type {
  CatalogProbeAcquisition,
  CatalogProbeInput,
  CatalogProbeStore,
} from "./catalog-probe-types.js";

type PersistedProbeHealth = NonNullable<
  Awaited<ReturnType<CatalogProbeStore["findProbeHealthById"]>>
>;

function requireCommonIdentity(
  input: CatalogProbeInput,
  operationHash: `sha256:${string}`,
  persisted: PersistedProbeHealth,
): ResourceHealthInput {
  const health = persisted.health;
  if (
    health.healthObservationId !== input.observationId ||
    health.operationHash !== operationHash ||
    health.originId !== input.originId ||
    health.resourceId !== input.resourceId ||
    health.method !== input.method ||
    health.routeTemplate !== input.routeTemplate
  ) {
    throw new Error("catalog probe operation conflicts with durable state");
  }
  return health;
}

export function recoverCatalogProbeAcquisition(
  input: CatalogProbeInput,
  operationHash: `sha256:${string}`,
  persisted: PersistedProbeHealth,
): CatalogProbeAcquisition {
  const health = requireCommonIdentity(input, operationHash, persisted);
  const persistence = Object.freeze({
    id: health.healthObservationId,
    outcome: "replayed" as const,
  });
  const probe = persisted.probe;
  if (probe === null) {
    if (
      health.result.kind !== "failing" ||
      health.result.domain === "payment-contract"
    ) {
      throw new Error("catalog probe durable failure is inconsistent");
    }
    return Object.freeze({ outcome: "failed", health, persistence });
  }
  if (
    probe.observationId !== input.observationId ||
    probe.originId !== input.originId ||
    probe.resourceId !== input.resourceId ||
    probe.method !== input.method ||
    probe.routeTemplate !== input.routeTemplate
  ) {
    throw new Error("catalog probe durable observation is inconsistent");
  }
  if (
    probe.result.kind === "verified-x402" &&
    (probe.result.revisionId !== input.revisionId ||
      probe.result.name !== input.name ||
      probe.result.description !== input.description)
  ) {
    throw new Error("catalog probe durable revision is inconsistent");
  }
  return Object.freeze({
    outcome: "observed",
    observation: probe,
    health,
    persistence,
  });
}
