import { expect, it } from "vitest";
import {
  validateProbeHealth,
  validateUnprobedHealth,
} from "../src/resource-health-validation.js";
import type {
  ProbeObservationInput,
  ResourceHealthInput,
  ResourceHealthResult,
} from "../src/index.js";
import { nonX402Probe, verifiedProbe } from "./publication.fixtures.js";

function healthFor(
  probe: ProbeObservationInput = verifiedProbe,
  result: ResourceHealthResult = { kind: "healthy" },
): ResourceHealthInput {
  return {
    healthObservationId: "018f3f24-7d4a-7e2c-a421-0f3473b96020",
    originId: probe.originId,
    resourceId: probe.resourceId,
    method: probe.method,
    routeTemplate: probe.routeTemplate,
    observedAt: probe.observedAt,
    latencyMilliseconds: 125,
    operationHash: `sha256:${"8".repeat(64)}` as const,
    evidenceHash: `sha256:${"f".repeat(64)}` as const,
    result,
  };
}

it("binds linked health idempotency to the exact probe observation", () => {
  const original = validateProbeHealth({
    probe: verifiedProbe,
    health: healthFor(),
  });
  const changedProbe = {
    ...verifiedProbe,
    evidenceHash: `sha256:${"1".repeat(64)}` as const,
  };
  const changed = validateProbeHealth({
    probe: changedProbe,
    health: healthFor(changedProbe),
  });

  expect(changed.probe.observationId).toBe(original.probe.observationId);
  expect(changed.health.requestHash).not.toBe(original.health.requestHash);
});

it("binds health idempotency to the exact probe operation", () => {
  const original = validateProbeHealth({
    probe: verifiedProbe,
    health: healthFor(),
  });
  const changed = validateProbeHealth({
    probe: verifiedProbe,
    health: {
      ...healthFor(),
      operationHash: `sha256:${"7".repeat(64)}`,
    },
  });

  expect(changed.health.requestHash).not.toBe(original.health.requestHash);
});

it("requires health identity, time, and outcome to match its probe", () => {
  expect(() =>
    validateProbeHealth({
      probe: verifiedProbe,
      health: { ...healthFor(), observedAt: "2026-07-18T00:00:02.000Z" },
    }),
  ).toThrow("does not match");

  const probe = nonX402Probe();
  expect(() =>
    validateProbeHealth({
      probe,
      health: healthFor(probe),
    }),
  ).toThrow("non-x402");
});

it("allows only bounded unprobed transport or provider failures", () => {
  expect(() =>
    validateUnprobedHealth({
      ...healthFor(),
      result: { kind: "failing", domain: "transport", code: "TIMEOUT" },
    }),
  ).not.toThrow();
  expect(() =>
    validateUnprobedHealth({
      ...healthFor(),
      result: {
        kind: "failing",
        domain: "payment-contract",
        code: "HTTP_200",
      },
    }),
  ).toThrow("unprobed");
  expect(() =>
    validateUnprobedHealth({
      ...healthFor(),
      latencyMilliseconds: 30_001,
      result: { kind: "failing", domain: "transport", code: "TIMEOUT" },
    }),
  ).toThrow("latency");
});

it("requires exact HTTP status only for provider-handler failures", () => {
  expect(() =>
    validateUnprobedHealth({
      ...healthFor(),
      result: {
        kind: "failing",
        domain: "provider-handler",
        code: "HTTP_STATUS",
      },
    } as never),
  ).toThrow(/HTTP status|keys/iu);
  expect(() =>
    validateUnprobedHealth({
      ...healthFor(),
      result: {
        kind: "failing",
        domain: "provider-handler",
        code: "HTTP_STATUS",
        httpStatus: 503,
      },
    } as never),
  ).not.toThrow();
  expect(() =>
    validateUnprobedHealth({
      ...healthFor(),
      result: {
        kind: "failing",
        domain: "transport",
        code: "TIMEOUT",
        httpStatus: 504,
      },
    } as never),
  ).toThrow(/keys/iu);
});
