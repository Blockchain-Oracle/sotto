import { commitResourceRoute } from "@sotto/x402-canton";
import type { FiveNorthBootstrapFactoryObservation } from "./five-north-bootstrap-factory.js";
import type { FiveNorthCapabilityPolicy } from "./five-north-capability-policy.js";
import type {
  FiveNorthCapabilityReadinessObservation,
  FiveNorthCapabilityReadinessScope,
} from "./five-north-capability-readiness.js";

const RESEARCH_LIFETIME_MS = 60 * 60 * 1_000;

type ProbeInput = Readonly<{
  agentParty: string;
  nowMilliseconds: number;
  observeFactory: (
    readiness: FiveNorthCapabilityReadinessObservation,
    policy: FiveNorthCapabilityPolicy,
  ) => Promise<FiveNorthBootstrapFactoryObservation>;
  observeReadiness: (
    scope: FiveNorthCapabilityReadinessScope,
  ) => Promise<FiveNorthCapabilityReadinessObservation>;
  payerParty: string;
  providerParty: string;
  resourceUrl: string;
}>;

function researchPolicy(input: ProbeInput): FiveNorthCapabilityPolicy {
  if (
    !Number.isSafeInteger(input.nowMilliseconds) ||
    input.nowMilliseconds < 0 ||
    !Number.isSafeInteger(input.nowMilliseconds + RESEARCH_LIFETIME_MS) ||
    input.nowMilliseconds + RESEARCH_LIFETIME_MS > 8_640_000_000_000_000
  ) {
    throw new Error("factory probe clock is invalid");
  }
  return Object.freeze({
    agentParty: input.agentParty,
    allowedRecipient: input.providerParty,
    allowedResourceHash: commitResourceRoute(input.resourceUrl),
    expiresAt: new Date(
      input.nowMilliseconds + RESEARCH_LIFETIME_MS,
    ).toISOString(),
    maximumTotalDebitAtomic: "3250000000",
    payerParty: input.payerParty,
    perCallLimitAtomic: "2500000000",
    remainingAllowanceAtomic: "10000000000",
  });
}

export async function runFiveNorthBootstrapFactoryProbe(input: ProbeInput) {
  const scope = Object.freeze({
    agentParty: input.agentParty,
    payerParty: input.payerParty,
  });
  const policy = researchPolicy(input);
  const readiness = await input.observeReadiness(scope);
  const factory = await input.observeFactory(readiness, policy);
  return Object.freeze({
    authenticated: true as const,
    factoryAuthority: "direct-pinned-disclosure" as const,
    mutation: false as const,
    observedAt: factory.observedAt,
    status: "factory-observed" as const,
  });
}
