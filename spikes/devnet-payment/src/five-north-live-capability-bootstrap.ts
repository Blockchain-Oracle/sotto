import { isAbsolute } from "node:path";
import type { BoundedCapabilityBootstrapRequest } from "@sotto/x402-canton";
import {
  recoverJournaledCapabilityBootstrap,
  startJournaledCapabilityBootstrap,
} from "./capability-bootstrap-journal-runner.js";
import {
  buildFiveNorthCapabilityBootstrap,
  createFiveNorthBootstrapFactoryObserver,
} from "./five-north-bootstrap-factory.js";
import { buildFiveNorthLeastAuthorityCapabilityPolicy } from "./five-north-capability-bootstrap-policy.js";
import {
  createFiveNorthCapabilityReadinessObserver,
  type FiveNorthCapabilityReadinessReader,
} from "./five-north-capability-readiness.js";

const ROUTES = [
  "acs",
  "ledgerEnd",
  "package",
  "preferred",
  "registry",
  "rules",
  "submit",
  "token",
] as const;
const ROUTE_LIMITS = Object.freeze({
  acs: 3,
  ledgerEnd: 3,
  package: 1,
  preferred: 1,
  registry: 1,
  rules: 1,
  submit: 1,
  token: 1,
});
const TRANSPORT_KEYS = [
  "factory",
  "networkCallCounts",
  "readActiveCapabilities",
  "readiness",
  "submit",
] as const;

type NetworkCounts = Readonly<Record<(typeof ROUTES)[number], number>>;
type FactoryReaders = Parameters<
  typeof createFiveNorthBootstrapFactoryObserver
>[0];
type StartTransport = Readonly<{
  factory: FactoryReaders;
  networkCallCounts: () => NetworkCounts;
  readActiveCapabilities: () => Promise<unknown>;
  readiness: FiveNorthCapabilityReadinessReader;
  submit: (request: BoundedCapabilityBootstrapRequest) => Promise<unknown>;
}>;
type StartInput = Readonly<{
  agentParty: string;
  payerParty: string;
  providerParty: string;
  resourceUrl: string;
  sourceCommit: string;
  transport: StartTransport;
  workspaceRoot: string;
}>;
type RecoverInput = Readonly<{
  networkCallCounts: () => NetworkCounts;
  readActiveCapabilities: () => Promise<unknown>;
  sourceCommit: string;
  workspaceRoot: string;
}>;

function requireSource(input: {
  sourceCommit: string;
  workspaceRoot: string;
}): void {
  if (!/^[0-9a-f]{40}$/u.test(input.sourceCommit)) {
    throw new Error("live capability bootstrap source commit is invalid");
  }
  if (!isAbsolute(input.workspaceRoot)) {
    throw new Error("live capability bootstrap workspace root is invalid");
  }
}

function requireTransport(transport: StartTransport): StartTransport {
  if (
    typeof transport !== "object" ||
    transport === null ||
    JSON.stringify(Object.keys(transport).sort()) !==
      JSON.stringify([...TRANSPORT_KEYS].sort())
  ) {
    throw new Error("live capability bootstrap transport keys are invalid");
  }
  return transport;
}

function safeCounts(read: () => NetworkCounts): NetworkCounts {
  const candidate = read();
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    JSON.stringify(Object.keys(candidate).sort()) !==
      JSON.stringify([...ROUTES].sort())
  ) {
    throw new Error("capability bootstrap network counts are invalid");
  }
  const counts = Object.fromEntries(
    ROUTES.map((route) => {
      const value = candidate[route];
      if (
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value > ROUTE_LIMITS[route]
      ) {
        throw new Error("capability bootstrap network count exceeds limit");
      }
      return [route, value];
    }),
  ) as Record<(typeof ROUTES)[number], number>;
  return Object.freeze(counts);
}

function evidence(
  mode: "recover" | "start",
  outcome: "recovered" | "reconciled-after-ambiguous" | "submitted",
  counts: NetworkCounts,
) {
  return Object.freeze({
    schema: "sotto-five-north-capability-bootstrap-evidence-v1" as const,
    status: "OBSERVED" as const,
    resolvedCompatibleClassification: "ONE" as const,
    ledgerMutationObserved: true,
    mode,
    networkCallCounts: counts,
    prohibitedCalls: Object.freeze({
      faucet: false,
      payment: false,
      prepare: false,
      provider: false,
      purchaseExecute: false,
      purchaseSign: false,
      settlement: false,
    }),
    responseAcsAgreement:
      outcome === "submitted"
        ? ("MATCHED" as const)
        : ("NOT_OBSERVED" as const),
  });
}

export async function startFiveNorthLiveCapabilityBootstrap(input: StartInput) {
  requireSource(input);
  const transport = requireTransport(input.transport);
  const policy = buildFiveNorthLeastAuthorityCapabilityPolicy({
    agentParty: input.agentParty,
    nowMilliseconds: Date.now(),
    payerParty: input.payerParty,
    providerParty: input.providerParty,
    resourceUrl: input.resourceUrl,
  });
  const readiness = await createFiveNorthCapabilityReadinessObserver(
    transport.readiness,
  )({ agentParty: input.agentParty, payerParty: input.payerParty });
  const factory = await createFiveNorthBootstrapFactoryObserver(
    transport.factory,
  )(readiness, policy);
  const request = buildFiveNorthCapabilityBootstrap(readiness, factory, policy);
  const result = await startJournaledCapabilityBootstrap({
    readActiveCapabilities: transport.readActiveCapabilities,
    request,
    sourceCommit: input.sourceCommit,
    submit: transport.submit,
    workspaceRoot: input.workspaceRoot,
  });
  return evidence(
    "start",
    result.outcome,
    safeCounts(transport.networkCallCounts),
  );
}

export async function recoverFiveNorthLiveCapabilityBootstrap(
  input: RecoverInput,
) {
  requireSource(input);
  const result = await recoverJournaledCapabilityBootstrap(input);
  return evidence(
    "recover",
    result.outcome,
    safeCounts(input.networkCallCounts),
  );
}
