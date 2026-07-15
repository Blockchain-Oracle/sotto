import { timingSafeEqual } from "node:crypto";
import { assertBoundedCapabilityBootstrapFresh } from "./bounded-capability-bootstrap.js";
import {
  claimPreparedCapabilityBootstrapObservation,
  type PreparedCapabilityBootstrapObservation,
} from "./prepared-capability-bootstrap-observation.js";
import type { PreparedCapabilityBootstrapState } from "./prepared-capability-bootstrap-types.js";
import { recomputeWalletPreparedHashPrecheck } from "./prepared-purchase-wallet-precheck.js";

export type PreparedCapabilityBootstrapHashDependencies = Readonly<{
  recomputeOfficialHash: (
    preparedTransaction: Uint8Array,
  ) => Promise<Uint8Array>;
}>;

declare const hashVerifiedCapabilityBootstrapBrand: unique symbol;
export type HashVerifiedPreparedCapabilityBootstrap = Readonly<{
  observationId: `sha256:${string}`;
  preparedTransactionHash: string;
  verifiedAt: string;
  readonly [hashVerifiedCapabilityBootstrapBrand]: true;
}>;

export type ClaimedPreparedCapabilityBootstrap = Readonly<{
  capturedAt: number;
  preparedTransaction: Uint8Array;
  preparedTransactionHash: string;
}>;

type VerifiedState = {
  claimed: boolean;
  prepared: PreparedCapabilityBootstrapState;
};

const states = new WeakMap<object, VerifiedState>();

function officialHasher(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    Object.keys(value).length !== 1 ||
    typeof (value as Record<string, unknown>).recomputeOfficialHash !==
      "function"
  ) {
    throw new Error("official prepared hash recomputation is required");
  }
  return (value as PreparedCapabilityBootstrapHashDependencies)
    .recomputeOfficialHash;
}

function digest(value: unknown, label: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) {
    throw new Error(`${label} must return exactly 32 bytes`);
  }
  return new Uint8Array(value);
}

function requireMatch(
  participant: Uint8Array,
  candidate: Uint8Array,
  label: string,
): void {
  if (!timingSafeEqual(Buffer.from(participant), Buffer.from(candidate))) {
    throw new Error(`${label} does not match the participant digest`);
  }
}

function readState(candidate: unknown): VerifiedState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("hash-verified prepared capability is not authenticated");
  }
  const state = states.get(candidate);
  if (state === undefined) {
    throw new Error("hash-verified prepared capability is not authenticated");
  }
  if (state.claimed) {
    throw new Error("hash-verified prepared capability is already claimed");
  }
  assertBoundedCapabilityBootstrapFresh(state.prepared.request);
  return state;
}

/** @internal Approval projection only. */
export function readHashVerifiedPreparedCapabilityBootstrap(
  candidate: unknown,
): PreparedCapabilityBootstrapState {
  return readState(candidate).prepared;
}

export function claimHashVerifiedPreparedCapabilityBootstrap(
  candidate: unknown,
): ClaimedPreparedCapabilityBootstrap {
  const state = readState(candidate);
  if (state.claimed) {
    throw new Error("hash-verified prepared capability is already claimed");
  }
  state.claimed = true;
  return Object.freeze({
    capturedAt: state.prepared.capturedAt,
    preparedTransaction: new Uint8Array(state.prepared.preparedTransaction),
    preparedTransactionHash: state.prepared.preparedTransactionHash,
  });
}

export async function verifyPreparedCapabilityBootstrapHash(
  observation: PreparedCapabilityBootstrapObservation,
  dependencies: PreparedCapabilityBootstrapHashDependencies,
): Promise<HashVerifiedPreparedCapabilityBootstrap> {
  const recomputeOfficialHash = officialHasher(dependencies);
  const prepared = claimPreparedCapabilityBootstrapObservation(observation);
  const participant = digest(
    new Uint8Array(Buffer.from(prepared.preparedTransactionHash, "base64")),
    "prepared capability participant hash",
  );
  const precheck = digest(
    await recomputeWalletPreparedHashPrecheck(
      new Uint8Array(prepared.preparedTransaction),
    ),
    "prepared capability hash precheck",
  );
  assertBoundedCapabilityBootstrapFresh(prepared.request);
  requireMatch(participant, precheck, "prepared capability hash precheck");
  const official = digest(
    await recomputeOfficialHash(new Uint8Array(prepared.preparedTransaction)),
    "official prepared capability hash recomputation",
  );
  assertBoundedCapabilityBootstrapFresh(prepared.request);
  requireMatch(
    participant,
    official,
    "official prepared capability hash recomputation",
  );
  const verified = Object.freeze({
    observationId: observation.observationId,
    preparedTransactionHash: prepared.preparedTransactionHash,
    verifiedAt: new Date().toISOString(),
  }) as HashVerifiedPreparedCapabilityBootstrap;
  states.set(verified, { claimed: false, prepared });
  return verified;
}
