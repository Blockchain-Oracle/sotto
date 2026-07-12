import {
  parsePaymentChallenge,
  type CantonPaymentRequirement,
} from "./payment-requirement.js";
import type { HttpRequestCommitment } from "./request-binding.js";

export type PaymentAuthorization = Readonly<{
  attemptId: string;
  bindingVersion: "sotto-http-request-v1";
  expiresAt: string;
  payerParty: string;
  requestCommitment: `sha256:${string}`;
  requirement: CantonPaymentRequirement;
}>;

type AuthorizationInput = Readonly<{
  attemptId: string;
  binding: HttpRequestCommitment;
  carriedRequestCommitment: `sha256:${string}`;
  observedAt: string;
  payerParty: string;
  requirement: CantonPaymentRequirement;
}>;

export function createPaymentAuthorization(
  input: AuthorizationInput,
): PaymentAuthorization {
  if (input.attemptId !== input.binding.commitment) {
    throw new Error("Payment attempt must equal the request commitment");
  }
  if (input.carriedRequestCommitment !== input.binding.commitment) {
    throw new Error("Payment carrier changed the request commitment");
  }
  if (input.payerParty.trim() === "") {
    throw new Error("Payment authorization requires payerParty");
  }
  const observedAt = Date.parse(input.observedAt);
  if (Number.isNaN(observedAt)) {
    throw new Error("Payment authorization requires observedAt");
  }
  const requirement = parsePaymentChallenge(input.requirement);
  const lifetimeSeconds = Math.min(
    requirement.maxTimeoutSeconds,
    requirement.extra.executeBeforeSeconds,
  );

  return {
    attemptId: input.attemptId,
    bindingVersion: input.binding.version,
    expiresAt: new Date(observedAt + lifetimeSeconds * 1_000).toISOString(),
    payerParty: input.payerParty,
    requestCommitment: input.binding.commitment,
    requirement,
  };
}
