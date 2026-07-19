import type { CantonPaymentRequirement } from "@sotto/x402-canton";

export const MAX_PREPARE_ONLY_PURCHASE_MS = 30_000;
export const PREPARE_EXPIRY_RESERVE_MS = 5_000;

export type PrepareOnlyScope = Readonly<{
  callerSignal?: AbortSignal;
  challengeDeadlineSignal?: AbortSignal;
  outerDeadlineSignal: AbortSignal;
  signal: AbortSignal;
}>;

function challengeDeadlineMilliseconds(
  observedAt: string,
  requirement: CantonPaymentRequirement,
): number {
  const observedAtMs = Date.parse(observedAt);
  const windowMs =
    Math.min(
      requirement.maxTimeoutSeconds,
      requirement.extra.executeBeforeSeconds,
    ) * 1_000;
  const deadline = observedAtMs + windowMs;
  if (!Number.isSafeInteger(deadline)) {
    throw new Error("prepare-only purchase challenge deadline is invalid");
  }
  return deadline;
}

export function challengeExecuteBefore(
  observedAt: string,
  requirement: CantonPaymentRequirement,
): string {
  return new Date(
    challengeDeadlineMilliseconds(observedAt, requirement),
  ).toISOString();
}

export function createPrepareOnlyScope(
  callerSignal: AbortSignal | undefined,
  timeoutMilliseconds = MAX_PREPARE_ONLY_PURCHASE_MS,
): PrepareOnlyScope {
  if (
    !Number.isInteger(timeoutMilliseconds) ||
    timeoutMilliseconds < 1 ||
    timeoutMilliseconds > MAX_PREPARE_ONLY_PURCHASE_MS
  ) {
    throw new Error("prepare-only purchase timeout must be 1-30000ms");
  }
  const outerDeadlineSignal = AbortSignal.timeout(timeoutMilliseconds);
  const signal =
    callerSignal === undefined
      ? outerDeadlineSignal
      : AbortSignal.any([callerSignal, outerDeadlineSignal]);
  return Object.freeze({
    ...(callerSignal === undefined ? {} : { callerSignal }),
    outerDeadlineSignal,
    signal,
  });
}

export function bindChallengeDeadline(
  scope: PrepareOnlyScope,
  observedAt: string,
  requirement: CantonPaymentRequirement,
): PrepareOnlyScope {
  const remaining =
    challengeDeadlineMilliseconds(observedAt, requirement) -
    PREPARE_EXPIRY_RESERVE_MS -
    Date.now();
  if (!Number.isFinite(remaining) || remaining < 1) {
    throw new Error("prepare-only purchase challenge deadline is too short");
  }
  const challengeDeadlineSignal = AbortSignal.timeout(Math.ceil(remaining));
  return Object.freeze({
    ...scope,
    challengeDeadlineSignal,
    signal: AbortSignal.any([scope.signal, challengeDeadlineSignal]),
  });
}

export function requirePrepareOnlyActive(scope: PrepareOnlyScope): void {
  if (scope.callerSignal?.aborted === true) {
    throw new Error("prepare-only purchase cancelled");
  }
  if (
    scope.outerDeadlineSignal.aborted ||
    scope.challengeDeadlineSignal?.aborted === true
  ) {
    throw new Error("prepare-only purchase deadline exceeded");
  }
}
