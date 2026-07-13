import {
  parsePurchaseCapabilityCreatedEvent,
  type PurchaseCapabilitySnapshot,
} from "./purchase-capability-event.js";
import {
  exactKeys,
  identifier,
  objectValue,
  sha256Hex,
} from "./purchase-commitment-primitives.js";

export const MAX_CAPABILITY_OBSERVATION_AGE_MS = 60_000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;

declare const capabilityObservationBrand: unique symbol;

export type PurchaseCapabilityObservation = Readonly<{
  observationId: `sha256:${string}`;
  observedAt: string;
  readonly [capabilityObservationBrand]: true;
}>;

type CapabilityObservationState = Readonly<{
  activeAtOffset: number;
  capturedAt: number;
  observationId: `sha256:${string}`;
  observedAt: string;
  snapshot: PurchaseCapabilitySnapshot;
}>;

const capabilityObservationStates = new WeakMap<
  object,
  CapabilityObservationState
>();

export type PurchaseCapabilityAcsReader = (
  contractId: string,
) => Promise<unknown>;

function cloneSnapshot(
  snapshot: PurchaseCapabilitySnapshot,
): PurchaseCapabilitySnapshot {
  return {
    ...snapshot,
    instrument: { ...snapshot.instrument },
  };
}

function recordPurchaseCapabilityCreatedEvent(
  event: unknown,
  activeAtOffset: number,
): PurchaseCapabilityObservation {
  if (!Number.isSafeInteger(activeAtOffset) || activeAtOffset < 0) {
    throw new Error("capability activeAtOffset must be nonnegative");
  }
  const snapshot = parsePurchaseCapabilityCreatedEvent(event);
  const capturedAt = Date.now();
  const observedAt = new Date(capturedAt).toISOString();
  const observationId = `sha256:${sha256Hex(
    JSON.stringify({
      version: "sotto-capability-observation-v1",
      activeAtOffset,
      snapshot,
    }),
  )}` as const;
  const observation = Object.freeze({
    observationId,
    observedAt,
  }) as PurchaseCapabilityObservation;
  capabilityObservationStates.set(observation, {
    activeAtOffset,
    capturedAt,
    observationId,
    observedAt,
    snapshot: cloneSnapshot(snapshot),
  });
  return observation;
}

export function createPurchaseCapabilityObserver(
  reader: PurchaseCapabilityAcsReader,
): (contractId: string) => Promise<PurchaseCapabilityObservation> {
  return async (contractId) => {
    const expectedContractId = identifier(
      contractId,
      "requested capability contractId",
    );
    const result = objectValue(
      await reader(expectedContractId),
      "capability ACS result",
    );
    exactKeys(
      result,
      ["activeAtOffset", "createdEvent"],
      "capability ACS result",
    );
    if (
      !Number.isSafeInteger(result.activeAtOffset) ||
      (result.activeAtOffset as number) < 0
    ) {
      throw new Error("capability activeAtOffset must be nonnegative");
    }
    const observation = recordPurchaseCapabilityCreatedEvent(
      result.createdEvent,
      result.activeAtOffset as number,
    );
    const state = capabilityObservationStates.get(observation)!;
    if (state.snapshot.contractId !== expectedContractId) {
      throw new Error("capability contractId does not match the ACS request");
    }
    return observation;
  };
}

/** @internal Test fixture only; not exported from the package entry point. */
export function capturePurchaseCapabilityCreatedEventForTest(
  event: unknown,
  activeAtOffset: number,
): PurchaseCapabilityObservation {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Test-only capability observation constructor is disabled");
  }
  return recordPurchaseCapabilityCreatedEvent(event, activeAtOffset);
}

export function readPurchaseCapabilityObservation(
  observation: unknown,
): CapabilityObservationState {
  if (typeof observation !== "object" || observation === null) {
    throw new Error("capability observation is not authenticated");
  }
  const state = capabilityObservationStates.get(observation);
  if (state === undefined) {
    throw new Error("capability observation is not authenticated");
  }
  const age = Date.now() - state.capturedAt;
  if (age < -CLOCK_ROLLBACK_TOLERANCE_MS) {
    throw new Error("capability observation clock moved backwards");
  }
  if (age > MAX_CAPABILITY_OBSERVATION_AGE_MS) {
    throw new Error("capability observation is stale");
  }
  return { ...state, snapshot: cloneSnapshot(state.snapshot) };
}
