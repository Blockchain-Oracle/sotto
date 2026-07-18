import {
  validateProbeObservation,
  type ValidatedProbeObservation,
} from "./publication-probe-validation.js";
import {
  exactKeys,
  integer,
  objectValue,
  requestHash,
  sha256,
  time,
  uuid,
} from "./publication-validation-primitives.js";
import type {
  ProbeHealthInput,
  ResourceHealthFailureCode,
  ResourceHealthFailureDomain,
  ResourceHealthInput,
  ResourceHealthStatus,
} from "./resource-health-types.js";
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const FAILURE_CODES = Object.freeze({
  transport: new Set(["DNS_OR_NETWORK", "TIMEOUT"]),
  "payment-contract": new Set([
    "HTTP_200",
    "MISSING_PAYMENT_REQUIRED",
    "UNSUPPORTED_REQUIREMENT",
  ]),
  "provider-handler": new Set(["HTTP_STATUS"]),
});

export type ValidatedResourceHealth = Readonly<{
  healthObservationId: string;
  probeObservationId: string | null;
  probeOutcome: "verified-x402" | "non-x402" | null;
  probeRequestHash: string | null;
  originId: string;
  resourceId: string;
  method: string;
  routeTemplate: string;
  observedAt: string;
  latencyMilliseconds: number;
  operationHash: string;
  evidenceHash: string;
  status: ResourceHealthStatus;
  failureDomain: ResourceHealthFailureDomain | null;
  failureCode: ResourceHealthFailureCode | null;
  httpStatus: number | null;
  requestHash: string;
}>;

function healthResult(value: unknown) {
  const result = objectValue(value, "resource health result");
  if (result.kind === "healthy" || result.kind === "degraded") {
    exactKeys(result, ["kind"], "resource health result");
    return Object.freeze({
      status: result.kind,
      failureDomain: null,
      failureCode: null,
      httpStatus: null,
    });
  }
  const providerHandler = result.domain === "provider-handler";
  exactKeys(
    result,
    ["kind", "domain", "code", ...(providerHandler ? ["httpStatus"] : [])],
    "resource health result",
  );
  if (
    result.kind !== "failing" ||
    typeof result.domain !== "string" ||
    !Object.hasOwn(FAILURE_CODES, result.domain) ||
    typeof result.code !== "string" ||
    !FAILURE_CODES[result.domain as ResourceHealthFailureDomain].has(
      result.code,
    )
  ) {
    throw new Error("resource health failure is invalid");
  }
  return Object.freeze({
    status: "failing" as const,
    failureDomain: result.domain as ResourceHealthFailureDomain,
    failureCode: result.code as ResourceHealthFailureCode,
    httpStatus: providerHandler
      ? integer(result.httpStatus, "resource health HTTP status", 100, 599)
      : null,
  });
}

function validateHealth(
  candidate: ResourceHealthInput,
  probe: ValidatedProbeObservation | null,
): ValidatedResourceHealth {
  const input = objectValue(candidate, "resource health observation");
  exactKeys(
    input,
    [
      "healthObservationId",
      "originId",
      "resourceId",
      "method",
      "routeTemplate",
      "observedAt",
      "latencyMilliseconds",
      "operationHash",
      "evidenceHash",
      "result",
    ],
    "resource health observation",
  );
  if (typeof input.method !== "string" || !METHODS.has(input.method)) {
    throw new Error("resource health HTTP method is invalid");
  }
  if (
    typeof input.routeTemplate !== "string" ||
    !input.routeTemplate.startsWith("/") ||
    /[?#\s\p{Cc}]/u.test(input.routeTemplate) ||
    Buffer.byteLength(input.routeTemplate, "utf8") > 2_048
  ) {
    throw new Error("resource health route is invalid");
  }
  const result = healthResult(input.result);
  const common = Object.freeze({
    healthObservationId: uuid(
      input.healthObservationId,
      "health observation ID",
    ),
    originId: uuid(input.originId, "health origin ID"),
    resourceId: uuid(input.resourceId, "health resource ID"),
    method: input.method,
    routeTemplate: input.routeTemplate,
    observedAt: time(input.observedAt, "health observedAt"),
    latencyMilliseconds: integer(
      input.latencyMilliseconds,
      "health latency",
      0,
      30_000,
    ),
    operationHash: sha256(input.operationHash, "health operation hash"),
    evidenceHash: sha256(input.evidenceHash, "health evidence hash"),
  });
  const link = Object.freeze({
    probeObservationId: probe?.observationId ?? null,
    probeOutcome: probe?.outcome ?? null,
    probeRequestHash: probe?.requestHash ?? null,
  });
  const canonical = Object.freeze({ ...common, ...result, ...link });
  return Object.freeze({ ...canonical, requestHash: requestHash(canonical) });
}

function requireMatchingProbe(
  health: ValidatedResourceHealth,
  probe: ValidatedProbeObservation,
): void {
  if (
    health.originId !== probe.originId ||
    health.resourceId !== probe.resourceId ||
    health.method !== probe.method ||
    health.routeTemplate !== probe.routeTemplate ||
    health.observedAt !== probe.observedAt
  ) {
    throw new Error("resource health does not match its probe");
  }
  if (probe.outcome === "verified-x402") {
    if (health.status === "failing") {
      throw new Error("verified probe health result is invalid");
    }
    return;
  }
  if (
    health.status !== "failing" ||
    health.failureDomain !== "payment-contract" ||
    health.failureCode !== probe.failureCode
  ) {
    throw new Error("non-x402 probe health result is invalid");
  }
}

export function validateProbeHealth(input: ProbeHealthInput) {
  const candidate = objectValue(input, "probe health input");
  exactKeys(candidate, ["probe", "health"], "probe health input");
  const probe = validateProbeObservation(input.probe);
  const health = validateHealth(input.health, probe);
  requireMatchingProbe(health, probe);
  return Object.freeze({ probe, health });
}

export function validateUnprobedHealth(
  input: ResourceHealthInput,
): ValidatedResourceHealth {
  const health = validateHealth(input, null);
  if (
    health.status !== "failing" ||
    health.failureDomain === "payment-contract"
  ) {
    throw new Error("unprobed resource health result is invalid");
  }
  return health;
}
