import { randomBytes } from "node:crypto";
import { SOTTO_CONTROL_PACKAGE_ID } from "@sotto/x402-canton";
import {
  parseCapabilityAmuletRules,
  parseCapabilityPackagePresence,
  parsePreferredCapabilityPackage,
  readinessIdentifier,
  readinessParty,
} from "./five-north-capability-readiness-validation.js";

const MAXIMUM_AGE_MS = 60_000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;

export type FiveNorthCapabilityReadinessReader = Readonly<{
  readAmuletRules: () => Promise<unknown>;
  readAuthenticatedUserId: () => Promise<string>;
  readPackagePresence: (packageId: string) => Promise<unknown>;
  readPreferredSottoPackage: (
    payerParty: string,
    agentParty: string,
  ) => Promise<unknown>;
}>;

export type FiveNorthCapabilityReadinessScope = Readonly<{
  agentParty: string;
  payerParty: string;
}>;

declare const readinessBrand: unique symbol;
export type FiveNorthCapabilityReadinessObservation = Readonly<{
  observationId: `sha256:${string}`;
  observedAt: string;
  readonly [readinessBrand]: true;
}>;

export type FiveNorthCapabilityReadiness = Readonly<{
  expectedAdmin: string;
  packageId: typeof SOTTO_CONTROL_PACKAGE_ID;
  synchronizerId: string;
  userId: string;
}>;

type ReadinessState = FiveNorthCapabilityReadiness & {
  agentParty: string;
  capturedAt: number;
  payerParty: string;
};

const states = new WeakMap<object, ReadinessState>();

function readState(
  observation: unknown,
  scope: FiveNorthCapabilityReadinessScope,
): ReadinessState {
  if (typeof observation !== "object" || observation === null) {
    throw new Error("capability readiness observation is not authenticated");
  }
  const state = states.get(observation);
  if (state === undefined) {
    throw new Error("capability readiness observation is not authenticated");
  }
  const payerParty = readinessParty(scope.payerParty, "capability payer", true);
  const agentParty = readinessParty(scope.agentParty, "capability agent", true);
  if (payerParty !== state.payerParty || agentParty !== state.agentParty) {
    throw new Error("capability readiness scope does not match");
  }
  const age = Date.now() - state.capturedAt;
  if (age < -CLOCK_ROLLBACK_TOLERANCE_MS) {
    throw new Error("capability readiness clock moved backwards");
  }
  if (age > MAXIMUM_AGE_MS) {
    throw new Error("capability readiness observation is stale");
  }
  return state;
}

export function createFiveNorthCapabilityReadinessObserver(
  reader: FiveNorthCapabilityReadinessReader,
): (
  scope: FiveNorthCapabilityReadinessScope,
) => Promise<FiveNorthCapabilityReadinessObservation> {
  return async (scope) => {
    const payerParty = readinessParty(
      scope.payerParty,
      "capability payer",
      true,
    );
    const agentParty = readinessParty(
      scope.agentParty,
      "capability agent",
      true,
    );
    if (payerParty === agentParty) {
      throw new Error("capability payer and agent must be distinct");
    }
    const acquisitionStartedAt = Date.now();
    const [rulesValue, userIdValue, packageValue, preferredValue] =
      await Promise.all([
        reader.readAmuletRules(),
        reader.readAuthenticatedUserId(),
        reader.readPackagePresence(SOTTO_CONTROL_PACKAGE_ID),
        reader.readPreferredSottoPackage(payerParty, agentParty),
      ]);
    parseCapabilityPackagePresence(packageValue);
    const rules = parseCapabilityAmuletRules(rulesValue);
    parsePreferredCapabilityPackage(preferredValue, rules.synchronizerId);
    const userId = readinessIdentifier(
      userIdValue,
      "authenticated user ID",
      256,
    );
    if (
      readinessIdentifier(
        await reader.readAuthenticatedUserId(),
        "final authenticated user ID",
        256,
      ) !== userId
    ) {
      throw new Error("authenticated user changed during readiness discovery");
    }
    const capturedAt = Date.now();
    if (
      capturedAt < acquisitionStartedAt - CLOCK_ROLLBACK_TOLERANCE_MS ||
      capturedAt - acquisitionStartedAt > MAXIMUM_AGE_MS
    ) {
      throw new Error("capability readiness acquisition is stale");
    }
    const observation = Object.freeze({
      observationId: `sha256:${randomBytes(32).toString("hex")}`,
      observedAt: new Date(capturedAt).toISOString(),
    }) as FiveNorthCapabilityReadinessObservation;
    states.set(observation, {
      ...rules,
      agentParty,
      capturedAt: acquisitionStartedAt,
      packageId: SOTTO_CONTROL_PACKAGE_ID,
      payerParty,
      userId,
    });
    return observation;
  };
}

/** @internal Capability bootstrap authority only. */
export function readFiveNorthCapabilityReadiness(
  observation: unknown,
  scope: FiveNorthCapabilityReadinessScope,
): FiveNorthCapabilityReadiness {
  const state = readState(observation, scope);
  return Object.freeze({
    expectedAdmin: state.expectedAdmin,
    packageId: state.packageId,
    synchronizerId: state.synchronizerId,
    userId: state.userId,
  });
}
