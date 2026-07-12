import {
  commitHttpRequest,
  parsePaymentChallenge,
  type PaymentChallenge,
} from "@sotto/x402-canton";

export type ChallengeObservation = Readonly<{
  attemptId: string;
  bindingVersion: "sotto-http-request-v1";
  bodySha256: string;
  challenge: PaymentChallenge;
  delivery: "pending";
  httpStatus: 402;
  observedAt: string;
  requestCommitment: `sha256:${string}`;
  settlement: "pending";
}>;

type ObservationInput = Readonly<{
  additionalAuthoritativeHeaders?: ReadonlyArray<string>;
  challenge: PaymentChallenge;
  headers?: ReadonlyArray<readonly [string, string]>;
  method: string;
  observedAt: string;
  requestBody?: Uint8Array;
  resourceUrl: string;
}>;

type PaymentRequired = Readonly<{
  accepts: ReadonlyArray<unknown>;
  resource?: unknown;
  x402Version: 2;
}>;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: Record<string, unknown>, field: string): string {
  const candidate = value[field];
  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new Error(`Payment requirement requires ${field}`);
  }
  return candidate;
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
  return {
    accepts: input.accepts,
    ...(input.resource === undefined ? {} : { resource: input.resource }),
    x402Version: 2,
  };
}

export function selectCantonRequirement(
  paymentRequired: PaymentRequired,
  now = new Date(),
): PaymentChallenge {
  const matching = paymentRequired.accepts.filter((candidate) => {
    const value = objectValue(candidate, "Payment requirement");
    return value.scheme === "exact" && value.network === "canton:devnet";
  });
  if (matching.length !== 1) {
    throw new Error("Expected exactly one exact canton:devnet requirement");
  }

  const requirement = objectValue(matching[0], "Payment requirement");
  const extra = objectValue(requirement.extra, "Payment requirement extra");
  const challenge = parsePaymentChallenge({
    amount: requiredString(requirement, "amount"),
    asset: requiredString(requirement, "asset"),
    expiresAt: requiredString(extra, "expiresAt"),
    network: requiredString(requirement, "network"),
    recipient: requiredString(requirement, "payTo"),
    requestHash: requiredString(extra, "requestHash"),
  });
  if (Date.parse(challenge.expiresAt) <= now.getTime()) {
    throw new Error("Payment requirement is expired");
  }
  return challenge;
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

  return {
    attemptId: binding.commitment,
    bindingVersion: binding.version,
    bodySha256: binding.bodySha256,
    challenge: input.challenge,
    delivery: "pending",
    httpStatus: 402,
    observedAt: observedAt.toISOString(),
    requestCommitment: binding.commitment,
    settlement: "pending",
  };
}
