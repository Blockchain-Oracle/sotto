import type { PurchaseCapabilitySnapshot } from "./purchase-capability-event.js";

export type ExpectedBootstrapCapability = Omit<
  PurchaseCapabilitySnapshot,
  "contractId"
>;

export type BoundedCapabilityBootstrapState = Readonly<{
  commandId: string;
  expected: ExpectedBootstrapCapability;
  network: `canton:${string}`;
  packageId: string;
  synchronizerId: string;
  validatedAt: string;
}>;

const states = new WeakMap<object, BoundedCapabilityBootstrapState>();

const MAXIMUM_CANTON_NETWORK_BYTES = 128;
const CANONICAL_CANTON_NETWORK_PATTERN =
  /^canton:[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;

export function validateBoundedCapabilityBootstrapNetwork(
  value: unknown,
): `canton:${string}` {
  if (
    typeof value !== "string" ||
    new TextEncoder().encode(value).byteLength > MAXIMUM_CANTON_NETWORK_BYTES ||
    !CANONICAL_CANTON_NETWORK_PATTERN.test(value)
  ) {
    throw new Error("bootstrap network must be a canonical Canton network");
  }
  return value as `canton:${string}`;
}

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
