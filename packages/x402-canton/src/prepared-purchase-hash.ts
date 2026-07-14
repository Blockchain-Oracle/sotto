import { timingSafeEqual } from "node:crypto";
import {
  claimPreparedPurchaseObservation,
  type PreparedPurchaseObservation,
  type PreparedPurchaseState,
} from "./prepared-purchase-observation.js";
import { requirePreparedPurchaseFresh } from "./prepared-purchase-freshness.js";

export type PreparedPurchaseHashDependencies = Readonly<{
  recomputeOfficialHash: (
    preparedTransaction: Uint8Array,
  ) => Promise<Uint8Array>;
  recomputePrecheckHash?: (
    preparedTransaction: Uint8Array,
  ) => Promise<Uint8Array>;
}>;

declare const hashVerifiedPreparedPurchaseBrand: unique symbol;
export type HashVerifiedPreparedPurchase = Readonly<{
  observationId: `sha256:${string}`;
  preparedTransactionHash: string;
  verifiedAt: string;
  readonly [hashVerifiedPreparedPurchaseBrand]: true;
}>;

const states = new WeakMap<object, PreparedPurchaseState>();

/** @internal Bounded signer boundary only. */
export function claimHashVerifiedPreparedPurchase(
  candidate: unknown,
): PreparedPurchaseState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("hash-verified prepared Purchase is not authenticated");
  }
  const state = states.get(candidate);
  if (state === undefined) {
    throw new Error("hash-verified prepared Purchase is not authenticated");
  }
  states.delete(candidate);
  requireFresh(state);
  return state;
}

function digest(value: unknown, label: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) {
    throw new Error(`${label} must return exactly 32 bytes`);
  }
  return value;
}

function requireMatch(
  expected: Uint8Array,
  actual: Uint8Array,
  label: string,
): void {
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
    throw new Error(`${label} does not match the participant digest`);
  }
}

function requireFresh(state: PreparedPurchaseState): void {
  requirePreparedPurchaseFresh(
    state.capturedAt,
    state.intent.challenge.executeBefore,
    "prepared Purchase observation",
  );
}

export async function verifyPreparedPurchaseHash(
  observation: PreparedPurchaseObservation,
  dependencies: PreparedPurchaseHashDependencies,
): Promise<HashVerifiedPreparedPurchase> {
  const state = claimPreparedPurchaseObservation(observation);
  requireFresh(state);
  const participant = new Uint8Array(
    Buffer.from(state.preparedTransactionHash, "base64"),
  );
  if (dependencies.recomputePrecheckHash !== undefined) {
    const precheck = digest(
      await dependencies.recomputePrecheckHash(
        new Uint8Array(state.preparedTransaction),
      ),
      "prepared hash precheck",
    );
    requireMatch(participant, precheck, "prepared hash precheck");
  }
  const official = digest(
    await dependencies.recomputeOfficialHash(
      new Uint8Array(state.preparedTransaction),
    ),
    "official prepared hash recomputation",
  );
  requireMatch(participant, official, "official prepared hash recomputation");
  requireFresh(state);
  const result = Object.freeze({
    observationId: observation.observationId,
    preparedTransactionHash: state.preparedTransactionHash,
    verifiedAt: new Date().toISOString(),
  }) as HashVerifiedPreparedPurchase;
  states.set(result, state);
  return result;
}
