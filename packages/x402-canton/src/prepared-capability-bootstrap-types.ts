import type { BoundedCapabilityBootstrapRequest } from "./bounded-capability-bootstrap.js";

export const PREPARED_CAPABILITY_BOOTSTRAP_PATH =
  "/v2/interactive-submission/prepare" as const;
export const PREPARED_CAPABILITY_BOOTSTRAP_TIMEOUT_MS = 10_000;
export const MAX_PREPARED_CAPABILITY_RESPONSE_BYTES = 3_145_728;
export const MAX_PREPARED_CAPABILITY_TRANSACTION_BYTES = 2_097_152;

export type PreparedCapabilityBootstrapTransportRequest = Readonly<{
  body: BoundedCapabilityBootstrapRequest;
  contentType: "application/json";
  maximumResponseBytes: typeof MAX_PREPARED_CAPABILITY_RESPONSE_BYTES;
  method: "POST";
  path: typeof PREPARED_CAPABILITY_BOOTSTRAP_PATH;
  redirect: "error";
  timeoutMilliseconds: typeof PREPARED_CAPABILITY_BOOTSTRAP_TIMEOUT_MS;
}>;

export type PreparedCapabilityBootstrapReader = (
  request: PreparedCapabilityBootstrapTransportRequest,
) => Promise<Uint8Array>;

declare const preparedCapabilityBootstrapObservationBrand: unique symbol;
export type PreparedCapabilityBootstrapObservation = Readonly<{
  hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2";
  observationId: `sha256:${string}`;
  observedAt: string;
  preparedTransactionHash: string;
  readonly [preparedCapabilityBootstrapObservationBrand]: true;
}>;

export type PreparedCapabilityBootstrapState = Readonly<{
  capturedAt: number;
  preparedTransaction: Uint8Array;
  preparedTransactionHash: string;
  request: BoundedCapabilityBootstrapRequest;
}> & { claimed: boolean };
