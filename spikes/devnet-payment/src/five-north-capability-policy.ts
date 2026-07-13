import { createHash } from "node:crypto";
import {
  parseBoundedAtomic,
  validateBoundedIdentifier,
} from "@sotto/x402-canton";

const PARTY_PATTERN = /^sotto-[^\s:]+::1220[0-9a-f]{64}$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const MINIMUM_LIFETIME_MS = 5 * 60 * 1_000;
const MAXIMUM_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const MAXIMUM_ALLOWANCE_ATOMIC = 10_000_000_000n;

export type FiveNorthCapabilityPolicy = Readonly<{
  agentParty: string;
  allowedRecipient: string;
  allowedResourceHash: `sha256:${string}`;
  expiresAt: string;
  maximumTotalDebitAtomic: string;
  payerParty: string;
  perCallLimitAtomic: string;
  remainingAllowanceAtomic: string;
}>;

export type ValidatedFiveNorthCapabilityPolicy = Readonly<{
  digest: `sha256:${string}`;
  value: FiveNorthCapabilityPolicy;
}>;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("capability policy must be an object");
  }
  const result = value as Record<string, unknown>;
  const expected = [
    "agentParty",
    "allowedRecipient",
    "allowedResourceHash",
    "expiresAt",
    "maximumTotalDebitAtomic",
    "payerParty",
    "perCallLimitAtomic",
    "remainingAllowanceAtomic",
  ];
  if (
    JSON.stringify(Object.keys(result).sort()) !==
    JSON.stringify(expected.sort())
  ) {
    throw new Error("capability policy keys are invalid");
  }
  return result;
}

function party(value: unknown, label: string): string {
  const candidate = validateBoundedIdentifier(value, label);
  if (!PARTY_PATTERN.test(candidate)) {
    throw new Error(`${label} must be a bounded sotto- Party`);
  }
  return candidate;
}

function amount(value: unknown, label: string): bigint {
  const result = parseBoundedAtomic(value, label);
  if (result > MAXIMUM_ALLOWANCE_ATOMIC) {
    throw new Error(`${label} exceeds the bootstrap cap`);
  }
  return result;
}

function expiry(value: unknown, nowMilliseconds: number): string {
  if (typeof value !== "string") {
    throw new Error("capability expiry is invalid");
  }
  const parsed = Date.parse(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    new Date(parsed).toISOString() !== value
  ) {
    throw new Error("capability expiry is invalid");
  }
  const lifetime = parsed - nowMilliseconds;
  if (lifetime < MINIMUM_LIFETIME_MS || lifetime > MAXIMUM_LIFETIME_MS) {
    throw new Error("capability expiry lifetime is invalid");
  }
  return value;
}

export function validateFiveNorthCapabilityPolicy(
  candidate: unknown,
  nowMilliseconds: number,
): ValidatedFiveNorthCapabilityPolicy {
  if (!Number.isSafeInteger(nowMilliseconds) || nowMilliseconds < 0) {
    throw new Error("capability policy clock is invalid");
  }
  const input = record(candidate);
  const payerParty = party(input.payerParty, "capability payer");
  const agentParty = party(input.agentParty, "capability agent");
  if (payerParty === agentParty) {
    throw new Error("capability payer and agent must be distinct");
  }
  const perCall = amount(input.perCallLimitAtomic, "per-call limit");
  const remaining = amount(
    input.remainingAllowanceAtomic,
    "remaining allowance",
  );
  const maximumDebit = amount(
    input.maximumTotalDebitAtomic,
    "maximum total debit",
  );
  if (
    perCall <= 0n ||
    remaining < perCall ||
    maximumDebit < perCall ||
    maximumDebit > remaining
  ) {
    throw new Error("capability policy limits are inconsistent");
  }
  if (
    typeof input.allowedResourceHash !== "string" ||
    !SHA256_PATTERN.test(input.allowedResourceHash)
  ) {
    throw new Error("allowed resource hash must be SHA-256");
  }
  const value = Object.freeze({
    agentParty,
    allowedRecipient: party(input.allowedRecipient, "allowed recipient"),
    allowedResourceHash: input.allowedResourceHash as `sha256:${string}`,
    expiresAt: expiry(input.expiresAt, nowMilliseconds),
    maximumTotalDebitAtomic: maximumDebit.toString(),
    payerParty,
    perCallLimitAtomic: perCall.toString(),
    remainingAllowanceAtomic: remaining.toString(),
  });
  return Object.freeze({
    digest: `sha256:${createHash("sha256")
      .update(JSON.stringify(value))
      .digest("hex")}`,
    value,
  });
}
