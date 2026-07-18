import type { ProbeObservationInput } from "@sotto/database";
import { commitHttpRequest } from "@sotto/x402-canton";
import {
  catalogProbeEvidenceHash,
  catalogProbeOperationHash,
} from "./catalog-probe-evidence.js";
import {
  catalogResourceHealth,
  completedProbeLatency,
  paymentHealthResult,
} from "./catalog-probe-health.js";
import { validateCatalogProbeInput } from "./catalog-probe-input.js";
import { deriveCatalogProbeResult } from "./catalog-probe-result.js";
import { recoverCatalogProbeAcquisition } from "./catalog-probe-replay.js";
import {
  catalogProbeInterruption,
  catalogProbeNetworkSignal,
  catalogProbeResourceUrl,
  validateCatalogProbeOptions,
} from "./catalog-probe-network.js";
import type {
  CatalogProbe,
  CatalogProbeDependencies,
} from "./catalog-probe-types.js";
import { requestPinnedHttpsProbe } from "./pinned-https-request.js";
import { resolvePublicHttpsTarget } from "./public-https-target.js";
import { resolveSystemProbeAddresses } from "./system-probe-resolver.js";

export function createCatalogProbe(
  dependencies: CatalogProbeDependencies,
): CatalogProbe {
  if (typeof dependencies !== "object" || dependencies === null) {
    throw new Error("catalog probe dependencies are invalid");
  }
  const expectedNetwork = dependencies.expectedNetwork;
  if (
    typeof expectedNetwork !== "string" ||
    !/^canton:[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(expectedNetwork) ||
    Buffer.byteLength(expectedNetwork, "utf8") > 255
  ) {
    throw new Error("catalog probe trusted network is invalid");
  }
  const monotonicNowMilliseconds =
    dependencies.monotonicNowMilliseconds ?? (() => performance.now());
  if (
    typeof monotonicNowMilliseconds !== "function" ||
    typeof dependencies.store !== "object" ||
    dependencies.store === null ||
    typeof dependencies.store.findProbeHealthById !== "function" ||
    typeof dependencies.store.findProviderOriginById !== "function" ||
    typeof dependencies.store.recordProbeHealth !== "function" ||
    typeof dependencies.store.recordHealthObservation !== "function"
  ) {
    throw new Error("catalog probe dependencies are invalid");
  }
  const resolveAddresses =
    dependencies.resolveAddresses ?? resolveSystemProbeAddresses;
  const requestPinnedHttps =
    dependencies.requestPinnedHttps ?? requestPinnedHttpsProbe;
  return Object.freeze({
    acquireAndRecord: async (candidate, options = {}) => {
      const input = validateCatalogProbeInput(candidate);
      const operationHash = catalogProbeOperationHash(input, expectedNetwork);
      const validatedOptions = validateCatalogProbeOptions(options);
      const persisted = await dependencies.store.findProbeHealthById(
        input.observationId,
      );
      if (persisted !== null) {
        if (validatedOptions.caller?.aborted === true) {
          throw new Error("catalog probe cancelled");
        }
        return recoverCatalogProbeAcquisition(input, operationHash, persisted);
      }
      const origin = await dependencies.store.findProviderOriginById(
        input.originId,
      );
      if (origin === null || origin.originId !== input.originId) {
        throw new Error("catalog probe origin is unavailable");
      }
      const url = catalogProbeResourceUrl(
        origin.normalizedOrigin,
        input.routeTemplate,
      );
      const binding = commitHttpRequest({
        method: "GET",
        url,
      });
      const state = catalogProbeNetworkSignal(validatedOptions);
      const startedAt = monotonicNowMilliseconds();
      let response: Response;
      try {
        const target = await resolvePublicHttpsTarget(
          url,
          resolveAddresses,
          state.signal,
        );
        response = await requestPinnedHttps(target, {
          method: "GET",
          signal: state.signal,
        });
      } catch {
        const interruption = catalogProbeInterruption(state);
        if (
          state.deadline.aborted === false &&
          state.caller?.aborted === true
        ) {
          throw interruption;
        }
        const observedAt = new Date().toISOString();
        const health = catalogResourceHealth(
          input,
          observedAt,
          completedProbeLatency(startedAt, monotonicNowMilliseconds),
          operationHash,
          binding.commitment,
          Object.freeze({
            kind: "failing",
            domain: "transport",
            code: state.deadline.aborted ? "TIMEOUT" : "DNS_OR_NETWORK",
          }),
        );
        const persistence =
          await dependencies.store.recordHealthObservation(health);
        return Object.freeze({ outcome: "failed", health, persistence });
      }
      const latencyMilliseconds = completedProbeLatency(
        startedAt,
        monotonicNowMilliseconds,
      );
      if (response.status !== 200 && response.status !== 402) {
        const health = catalogResourceHealth(
          input,
          new Date().toISOString(),
          latencyMilliseconds,
          operationHash,
          binding.commitment,
          Object.freeze({
            kind: "failing",
            domain: "provider-handler",
            code: "HTTP_STATUS",
            httpStatus: response.status,
          }),
        );
        const persistence =
          await dependencies.store.recordHealthObservation(health);
        return Object.freeze({ outcome: "failed", health, persistence });
      }
      const observed = deriveCatalogProbeResult(
        response,
        input,
        url,
        expectedNetwork,
      );
      const observation = Object.freeze({
        observationId: input.observationId,
        originId: input.originId,
        resourceId: input.resourceId,
        method: input.method,
        routeTemplate: input.routeTemplate,
        observedAt: observed.observedAt,
        httpStatus: response.status,
        evidenceHash: catalogProbeEvidenceHash({
          httpStatus: response.status,
          observedAt: observed.observedAt,
          requestCommitment: binding.commitment,
          result: observed.result,
        }),
        result: observed.result,
      }) satisfies ProbeObservationInput;
      const health = catalogResourceHealth(
        input,
        observed.observedAt,
        latencyMilliseconds,
        operationHash,
        binding.commitment,
        paymentHealthResult(observed.result),
      );
      const persistence = await dependencies.store.recordProbeHealth({
        probe: observation,
        health,
      });
      return Object.freeze({
        outcome: "observed",
        observation,
        health,
        persistence,
      });
    },
  });
}
