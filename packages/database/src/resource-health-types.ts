import type {
  ProbeObservationInput,
  PublicationRecordResult,
  Sha256Identifier,
} from "./publication-types.js";

export type ResourceHealthStatus = "healthy" | "degraded" | "failing";
export type ResourceHealthFailureDomain =
  "transport" | "payment-contract" | "provider-handler";
export type ResourceHealthFailureCode =
  | "DNS_OR_NETWORK"
  | "TIMEOUT"
  | "HTTP_STATUS"
  | "HTTP_200"
  | "MISSING_PAYMENT_REQUIRED"
  | "UNSUPPORTED_REQUIREMENT";

export type ResourceHealthResult =
  | Readonly<{ kind: "healthy" | "degraded" }>
  | Readonly<{
      kind: "failing";
      domain: "transport";
      code: "DNS_OR_NETWORK" | "TIMEOUT";
    }>
  | Readonly<{
      kind: "failing";
      domain: "payment-contract";
      code: "HTTP_200" | "MISSING_PAYMENT_REQUIRED" | "UNSUPPORTED_REQUIREMENT";
    }>
  | Readonly<{
      kind: "failing";
      domain: "provider-handler";
      code: "HTTP_STATUS";
      httpStatus: number;
    }>;

export type ResourceHealthInput = Readonly<{
  healthObservationId: string;
  originId: string;
  resourceId: string;
  method: string;
  routeTemplate: string;
  observedAt: string;
  latencyMilliseconds: number;
  operationHash: Sha256Identifier;
  evidenceHash: Sha256Identifier;
  result: ResourceHealthResult;
}>;

export type ProbeHealthInput = Readonly<{
  probe: ProbeObservationInput;
  health: ResourceHealthInput;
}>;

export type ResourceHealthObservation = Readonly<{
  healthObservationId: string;
  probeObservationId: string | null;
  resourceId: string;
  status: ResourceHealthStatus;
  failureDomain: ResourceHealthFailureDomain | null;
  failureCode: ResourceHealthFailureCode | null;
  httpStatus: number | null;
  operationHash: Sha256Identifier;
  observedAt: string;
  latencyMilliseconds: number;
}>;

export type ResourceHealthRecordResult = PublicationRecordResult;

export type PersistedProbeHealth = Readonly<{
  probe: ProbeObservationInput | null;
  health: ResourceHealthInput;
}>;
