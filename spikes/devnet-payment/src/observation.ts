import { createHash } from "node:crypto";
import {
  parsePaymentChallenge,
  type PaymentChallenge,
} from "@sotto/x402-canton";

export type ChallengeObservation = Readonly<{
  attemptId: string;
  challenge: PaymentChallenge;
  delivery: "pending";
  httpStatus: 402;
  observedAt: string;
  settlement: "pending";
}>;

type ObservationInput = Readonly<{
  challenge: PaymentChallenge;
  method: string;
  observedAt: string;
  requestBody?: string;
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
  const canonicalRequest = JSON.stringify({
    body: input.requestBody ?? "",
    method: input.method.toUpperCase(),
    url: new URL(input.resourceUrl).toString(),
  });
  const attemptId = `sha256:${createHash("sha256")
    .update(canonicalRequest)
    .digest("hex")}`;

  return {
    attemptId,
    challenge: input.challenge,
    delivery: "pending",
    httpStatus: 402,
    observedAt: observedAt.toISOString(),
    settlement: "pending",
  };
}
