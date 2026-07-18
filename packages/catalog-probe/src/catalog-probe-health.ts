import type {
  NonX402ProbeResult,
  ResourceHealthInput,
  ResourceHealthResult,
  VerifiedX402ProbeResult,
} from "@sotto/database";
import { catalogProbeHealthEvidenceHash } from "./catalog-probe-evidence.js";
import type { CatalogProbeInput } from "./catalog-probe-types.js";

export function completedProbeLatency(
  startedAt: number,
  monotonicNowMilliseconds: () => number,
): number {
  const completedAt = monotonicNowMilliseconds();
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(completedAt) ||
    startedAt < 0 ||
    completedAt < startedAt
  ) {
    throw new Error("catalog probe monotonic clock is invalid");
  }
  return Math.min(30_000, Math.round(completedAt - startedAt));
}

export function paymentHealthResult(
  probe: VerifiedX402ProbeResult | NonX402ProbeResult,
): ResourceHealthResult {
  if (probe.kind === "verified-x402") {
    return Object.freeze({ kind: "healthy" });
  }
  return Object.freeze({
    kind: "failing",
    domain: "payment-contract",
    code: probe.reason,
  });
}

export function catalogResourceHealth(
  input: CatalogProbeInput,
  observedAt: string,
  latencyMilliseconds: number,
  operationHash: `sha256:${string}`,
  requestCommitment: string,
  result: ResourceHealthResult,
): ResourceHealthInput {
  const evidenceHash = catalogProbeHealthEvidenceHash({
    latencyMilliseconds,
    observedAt,
    operationHash,
    requestCommitment,
    result,
  });
  return Object.freeze({
    healthObservationId: input.observationId,
    originId: input.originId,
    resourceId: input.resourceId,
    method: input.method,
    routeTemplate: input.routeTemplate,
    observedAt,
    latencyMilliseconds,
    operationHash,
    evidenceHash,
    result,
  });
}
