import type { PurchaseCapabilitySnapshot } from "./purchase-capability-event.js";

export type ExpectedBootstrapCapability = Omit<
  PurchaseCapabilitySnapshot,
  "contractId"
>;

export type BoundedCapabilityBootstrapState = Readonly<{
  commandId: string;
  expected: ExpectedBootstrapCapability;
  validatedAt: string;
}>;

const states = new WeakMap<object, BoundedCapabilityBootstrapState>();

export function registerBoundedCapabilityBootstrap(
  request: object,
  state: BoundedCapabilityBootstrapState,
): void {
  states.set(request, state);
}

export function boundedCapabilityBootstrapState(
  request: unknown,
): BoundedCapabilityBootstrapState {
  if (typeof request !== "object" || request === null) {
    throw new Error("bootstrap request is not authenticated");
  }
  const state = states.get(request);
  if (state === undefined) {
    throw new Error("bootstrap request is not authenticated");
  }
  return state;
}

export function matchesExpectedBootstrapCapability(
  snapshot: PurchaseCapabilitySnapshot,
  expected: ExpectedBootstrapCapability,
): boolean {
  const { contractId, ...actual } = snapshot;
  void contractId;
  return JSON.stringify(actual) === JSON.stringify(expected);
}
