import { createHash } from "node:crypto";

export const MAX_PAYMENT_REQUIRED_HEADER_BYTES = 16_384;
export const MAX_PAYMENT_OBSERVATION_AGE_MS = 600_000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;
const CANONICAL_BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

declare const paymentObservationBrand: unique symbol;

export type PaymentRequiredObservation = Readonly<{
  challengeId: `sha256:${string}`;
  httpStatus: 402;
  observedAt: string;
  readonly [paymentObservationBrand]: true;
}>;

type ObservationState = Readonly<{
  capturedAt: number;
  challengeBytes: Uint8Array;
  challengeId: `sha256:${string}`;
  observedAt: string;
}>;

const observationStates = new WeakMap<object, ObservationState>();

function hash(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function record(
  challengeBytes: Uint8Array,
  observedAt: string,
  capturedAt: number,
): PaymentRequiredObservation {
  if (
    challengeBytes.byteLength < 1 ||
    challengeBytes.byteLength > MAX_PAYMENT_REQUIRED_HEADER_BYTES
  ) {
    throw new Error("Decoded PAYMENT-REQUIRED must contain 1-16384 bytes");
  }
  const parsedTime = Date.parse(observedAt);
  if (
    !Number.isFinite(parsedTime) ||
    new Date(parsedTime).toISOString() !== observedAt
  ) {
    throw new Error("PAYMENT-REQUIRED observation time must be canonical");
  }
  const bytes = Uint8Array.from(challengeBytes);
  const challengeId = hash(bytes);
  const observation = Object.freeze({
    challengeId,
    httpStatus: 402 as const,
    observedAt,
  }) as PaymentRequiredObservation;
  observationStates.set(observation, {
    capturedAt,
    challengeBytes: bytes,
    challengeId,
    observedAt,
  });
  return observation;
}

function decodeHeader(header: string): Uint8Array {
  if (
    header === "" ||
    Buffer.byteLength(header, "utf8") > MAX_PAYMENT_REQUIRED_HEADER_BYTES
  ) {
    throw new Error("PAYMENT-REQUIRED must contain 1-16384 bytes");
  }
  if (
    header.length % 4 !== 0 ||
    !CANONICAL_BASE64.test(header) ||
    Buffer.from(header, "base64").toString("base64") !== header
  ) {
    throw new Error("PAYMENT-REQUIRED must use canonical base64");
  }
  return Uint8Array.from(Buffer.from(header, "base64"));
}

export function capturePaymentRequiredResponse(
  response: Pick<Response, "headers" | "status">,
): PaymentRequiredObservation {
  if (response.status !== 402) {
    throw new Error("Payment observation requires authentic HTTP 402");
  }
  const header = response.headers.get("PAYMENT-REQUIRED");
  if (header === null) {
    throw new Error("HTTP 402 requires a v2 PAYMENT-REQUIRED header");
  }
  const capturedAt = Date.now();
  return record(
    decodeHeader(header),
    new Date(capturedAt).toISOString(),
    capturedAt,
  );
}

export function readPaymentRequiredObservation(
  observation: unknown,
): ObservationState {
  if (typeof observation !== "object" || observation === null) {
    throw new Error("PAYMENT-REQUIRED observation is not authenticated");
  }
  const state = observationStates.get(observation);
  if (state === undefined) {
    throw new Error("PAYMENT-REQUIRED observation is not authenticated");
  }
  const age = Date.now() - state.capturedAt;
  if (age < -CLOCK_ROLLBACK_TOLERANCE_MS) {
    throw new Error("PAYMENT-REQUIRED observation clock moved backwards");
  }
  if (age > MAX_PAYMENT_OBSERVATION_AGE_MS) {
    throw new Error("PAYMENT-REQUIRED observation is stale");
  }
  return {
    ...state,
    challengeBytes: Uint8Array.from(state.challengeBytes),
  };
}

/** @internal Test fixture only; not exported from the package entry point. */
export function capturePaymentRequiredBytesForTest(
  challengeBytes: Uint8Array,
  observedAt: string,
): PaymentRequiredObservation {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Test-only payment observation constructor is disabled");
  }
  return record(challengeBytes, observedAt, Date.now());
}
