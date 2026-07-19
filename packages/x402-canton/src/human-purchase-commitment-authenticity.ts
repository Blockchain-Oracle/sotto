import { MAX_HUMAN_PURCHASE_CANONICAL_BYTES } from "./human-purchase-canonical.js";
import type { HumanPurchaseCommitment } from "./human-purchase-commitment-types.js";
import { sha256Hex } from "./purchase-commitment-primitives.js";

type AuthenticState = Readonly<{
  attemptId: string;
  challengeId: string;
  commitment: string;
  expiresAt: string;
  requestCommitment: string;
  version: string;
}>;

const authenticCommitments = new WeakMap<object, AuthenticState>();

function hash(value: Uint8Array): `sha256:${string}` {
  return `sha256:${sha256Hex(value)}`;
}

function register(result: HumanPurchaseCommitment): void {
  authenticCommitments.set(result, {
    attemptId: result.attemptId,
    challengeId: result.challengeId,
    commitment: result.commitment,
    expiresAt: result.expiresAt,
    requestCommitment: result.requestCommitment,
    version: result.version,
  });
}

export function registerAuthenticHumanPurchaseCommitment(
  result: HumanPurchaseCommitment,
): void {
  register(result);
}

export function assertAuthenticHumanPurchase(
  candidate: unknown,
): asserts candidate is HumanPurchaseCommitment {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("human purchase commitment is not authenticated");
  }
  const state = authenticCommitments.get(candidate);
  if (state === undefined) {
    throw new Error("human purchase commitment is not authenticated");
  }
  const value = candidate as HumanPurchaseCommitment;
  if (
    hash(value.canonicalBytes) !== state.commitment ||
    value.attemptId !== state.attemptId ||
    value.challengeId !== state.challengeId ||
    value.commitment !== state.commitment ||
    value.expiresAt !== state.expiresAt ||
    value.requestCommitment !== state.requestCommitment ||
    value.version !== state.version
  ) {
    throw new Error("human purchase commitment was mutated");
  }
}

/** @internal Authenticated prepare-authority restoration only. */
export function registerRestoredHumanPurchaseCommitment(
  result: HumanPurchaseCommitment,
): void {
  if (
    !(result.canonicalBytes instanceof Uint8Array) ||
    result.canonicalBytes.byteLength < 1 ||
    result.canonicalBytes.byteLength > MAX_HUMAN_PURCHASE_CANONICAL_BYTES ||
    hash(result.canonicalBytes) !== result.commitment
  ) {
    throw new Error("restored human purchase commitment is invalid");
  }
  register(result);
}
