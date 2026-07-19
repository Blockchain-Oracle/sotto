import { buildFiveNorthLeastAuthorityCapabilityPolicy } from "./five-north-capability-bootstrap-policy.js";
import type { FiveNorthBootstrapFactoryObservation } from "./five-north-bootstrap-factory.js";
import type { FiveNorthCapabilityPolicy } from "./five-north-capability-policy.js";
import type {
  FiveNorthCapabilityReadinessObservation,
  FiveNorthCapabilityReadinessScope,
} from "./five-north-capability-readiness.js";

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
  return buildFiveNorthLeastAuthorityCapabilityPolicy({
    agentParty: input.agentParty,
    nowMilliseconds: input.nowMilliseconds,
    payerParty: input.payerParty,
    providerParty: input.providerParty,
    resourceUrl: input.resourceUrl,
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
