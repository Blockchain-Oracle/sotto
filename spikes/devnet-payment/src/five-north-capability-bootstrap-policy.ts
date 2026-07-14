import { commitResourceRoute } from "@sotto/x402-canton";
import {
  validateFiveNorthCapabilityPolicy,
  type FiveNorthCapabilityPolicy,
} from "./five-north-capability-policy.js";

const LIFETIME_MS = 60 * 60 * 1_000;
const INPUT_KEYS = [
  "agentParty",
  "nowMilliseconds",
  "payerParty",
  "providerParty",
  "resourceUrl",
] as const;

export type FiveNorthLeastAuthorityPolicyInput = Readonly<{
  agentParty: string;
  nowMilliseconds: number;
  payerParty: string;
  providerParty: string;
  resourceUrl: string;
}>;

function requireExactInput(
  value: FiveNorthLeastAuthorityPolicyInput,
): FiveNorthLeastAuthorityPolicyInput {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify([...INPUT_KEYS].sort())
  ) {
    throw new Error("least-authority capability policy keys are invalid");
  }
  return value;
}

export function buildFiveNorthLeastAuthorityCapabilityPolicy(
  candidate: FiveNorthLeastAuthorityPolicyInput,
): FiveNorthCapabilityPolicy {
  const input = requireExactInput(candidate);
  if (
    !Number.isSafeInteger(input.nowMilliseconds) ||
    input.nowMilliseconds < 0 ||
    !Number.isSafeInteger(input.nowMilliseconds + LIFETIME_MS) ||
    input.nowMilliseconds + LIFETIME_MS > 8_640_000_000_000_000
  ) {
    throw new Error("least-authority capability policy clock is invalid");
  }
  return validateFiveNorthCapabilityPolicy(
    {
      agentParty: input.agentParty,
      allowedRecipient: input.providerParty,
      allowedResourceHash: commitResourceRoute(input.resourceUrl),
      expiresAt: new Date(input.nowMilliseconds + LIFETIME_MS).toISOString(),
      maximumTotalDebitAtomic: "3250000000",
      payerParty: input.payerParty,
      perCallLimitAtomic: "2500000000",
      remainingAllowanceAtomic: "3250000000",
    },
    input.nowMilliseconds,
  ).value;
}
