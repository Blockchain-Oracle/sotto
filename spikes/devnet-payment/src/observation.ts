import {
  commitHttpRequest,
  parsePaymentChallenge,
  type CantonPaymentRequirement,
} from "@sotto/x402-canton";

export type CompatibilityVerdict = Readonly<{
  exactRequestBinding: "not-proven";
  paymentFields: "valid";
  resourceUrlBinding: "absent" | "matched" | "mismatched";
  wire: "compatible";
}>;

export type ChallengeObservation = Readonly<{
  attemptId: string;
  bindingVersion: "sotto-http-request-v1";
  bodySha256: string;
  challenge: CantonPaymentRequirement;
  compatibility: CompatibilityVerdict;
  delivery: "pending";
  httpStatus: 402;
  observedAt: string;
  requestCommitment: `sha256:${string}`;
  settlement: "pending";
}>;

type ObservationInput = Readonly<{
  additionalAuthoritativeHeaders?: ReadonlyArray<string>;
  challenge: CantonPaymentRequirement;
  headers?: ReadonlyArray<readonly [string, string]>;
  method: string;
  observedAt: string;
  requestBody?: Uint8Array;
  resourceUrl: string;
  upstreamResourceUrl?: string;
}>;

type PaymentRequired = Readonly<{
  accepts: ReadonlyArray<unknown>;
  resource: Readonly<{ url: string }>;
  x402Version: 2;
}>;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function decodePaymentRequired(header: string): PaymentRequired {
  if (Buffer.byteLength(header, "utf8") > 16_384) {
    throw new Error("PAYMENT-REQUIRED exceeds 16384 bytes");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    throw new Error("PAYMENT-REQUIRED must contain base64-encoded JSON");
  }

  const input = objectValue(decoded, "Payment required challenge");
  if (input.x402Version !== 2) {
    throw new Error("Payment required challenge must use x402Version 2");
  }
  if (!Array.isArray(input.accepts) || input.accepts.length === 0) {
    throw new Error("Payment required challenge must contain accepts");
  }
  const resource = objectValue(input.resource, "Payment required resource");
  const resourceUrl = resource.url;
  if (typeof resourceUrl !== "string" || resourceUrl.trim() === "") {
    throw new Error("Payment required resource requires url");
  }
  return {
    accepts: input.accepts,
    resource: { url: resourceUrl },
    x402Version: 2,
  };
}

export function selectCantonRequirement(
  paymentRequired: PaymentRequired,
): CantonPaymentRequirement {
  const matching = paymentRequired.accepts.filter((candidate) => {
    const value = objectValue(candidate, "Payment requirement");
    return value.scheme === "exact" && value.network === "canton:devnet";
  });
  if (matching.length !== 1) {
    throw new Error("Expected exactly one exact canton:devnet requirement");
  }

  return parsePaymentChallenge(matching[0]);
}

export function createChallengeObservation(
  input: ObservationInput,
): ChallengeObservation {
  const observedAt = new Date(input.observedAt);
  if (Number.isNaN(observedAt.getTime())) {
    throw new Error("Observation requires an ISO timestamp");
  }
  const binding = commitHttpRequest({
    ...(input.additionalAuthoritativeHeaders === undefined
      ? {}
      : {
          additionalAuthoritativeHeaders: input.additionalAuthoritativeHeaders,
        }),
    ...(input.requestBody === undefined ? {} : { body: input.requestBody }),
    ...(input.headers === undefined ? {} : { headers: input.headers }),
    method: input.method.toUpperCase(),
    url: new URL(input.resourceUrl).toString(),
  });
  const upstreamResourceUrl = input.upstreamResourceUrl;
  const resourceUrlBinding =
    upstreamResourceUrl === undefined
      ? "absent"
      : new URL(upstreamResourceUrl).toString() ===
          new URL(input.resourceUrl).toString()
        ? "matched"
        : "mismatched";

  return {
    attemptId: binding.commitment,
    bindingVersion: binding.version,
    bodySha256: binding.bodySha256,
    challenge: input.challenge,
    compatibility: {
      exactRequestBinding: "not-proven",
      paymentFields: "valid",
      resourceUrlBinding,
      wire: "compatible",
    },
    delivery: "pending",
    httpStatus: 402,
    observedAt: observedAt.toISOString(),
    requestCommitment: binding.commitment,
    settlement: "pending",
  };
}
