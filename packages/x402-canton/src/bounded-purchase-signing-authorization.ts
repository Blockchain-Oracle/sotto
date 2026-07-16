import { randomBytes } from "node:crypto";
import { claimHashVerifiedPreparedPurchase } from "./prepared-purchase-hash.js";
import { requirePreparedPurchaseFresh } from "./prepared-purchase-freshness.js";
import type { PreparedPurchaseState } from "./prepared-purchase-observation-state.js";
import {
  SHA256_PATTERN,
  canonicalTime,
  identifier,
} from "./purchase-commitment-primitives.js";

declare const authorizationBrand: unique symbol;

export type BoundedPurchaseSigningAuthorization = Readonly<{
  attemptId: `sha256:${string}`;
  authorizationId: `sha256:${string}`;
  executeBefore: string;
  party: string;
  purchaseCommitment: `sha256:${string}`;
  readonly [authorizationBrand]: true;
}>;

export type BoundedPurchaseSigningMaterial = Readonly<{
  attemptId: `sha256:${string}`;
  party: string;
  preparedTransactionHash: Uint8Array;
  purchaseCommitment: `sha256:${string}`;
}>;

type AuthorizationState = Readonly<{
  capturedAt: number;
  digest: Uint8Array;
  executeBefore: string;
  material: Omit<BoundedPurchaseSigningMaterial, "preparedTransactionHash">;
}>;

const states = new WeakMap<object, AuthorizationState>();
const claimed = new WeakSet<object>();

function digest(value: string): Uint8Array {
  const bytes = new Uint8Array(Buffer.from(value, "base64"));
  if (
    bytes.byteLength !== 32 ||
    Buffer.from(bytes).toString("base64") !== value
  ) {
    bytes.fill(0);
    throw new Error("prepared Purchase signing digest is invalid");
  }
  return bytes;
}

function createAuthorization(
  state: PreparedPurchaseState,
): BoundedPurchaseSigningAuthorization {
  const party = state.intent.capability.agentParty;
  if (
    JSON.stringify(state.intent.actAs) !== JSON.stringify([party]) ||
    JSON.stringify(state.prepareRequest.actAs) !== JSON.stringify([party])
  ) {
    throw new Error("prepared Purchase signing authority does not match agent");
  }
  const authorization = Object.freeze({
    attemptId: state.intent.attemptId,
    authorizationId: `sha256:${randomBytes(32).toString("hex")}` as const,
    executeBefore: state.intent.challenge.executeBefore,
    party,
    purchaseCommitment: state.intent.purchaseCommitment,
  }) as BoundedPurchaseSigningAuthorization;
  states.set(authorization, {
    capturedAt: state.capturedAt,
    digest: digest(state.preparedTransactionHash),
    executeBefore: state.intent.challenge.executeBefore,
    material: Object.freeze({
      attemptId: state.intent.attemptId,
      party,
      purchaseCommitment: state.intent.purchaseCommitment,
    }),
  });
  return authorization;
}

/** @internal The bounded signer calls this only after semantic verification. */
export function createBoundedPurchaseSigningAuthorization(
  state: PreparedPurchaseState,
): BoundedPurchaseSigningAuthorization {
  return createAuthorization(state);
}

export function authorizeHashVerifiedPreparedPurchase(
  verified: unknown,
): BoundedPurchaseSigningAuthorization {
  return createAuthorization(claimHashVerifiedPreparedPurchase(verified));
}

export function claimBoundedPurchaseSigningAuthorization(
  candidate: unknown,
): BoundedPurchaseSigningMaterial {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error(
      "bounded Purchase signing authorization is not authenticated",
    );
  }
  const state = states.get(candidate);
  if (state === undefined) {
    if (claimed.has(candidate)) {
      throw new Error(
        "bounded Purchase signing authorization is already claimed",
      );
    }
    throw new Error(
      "bounded Purchase signing authorization is not authenticated",
    );
  }
  states.delete(candidate);
  claimed.add(candidate);
  try {
    requirePreparedPurchaseFresh(
      state.capturedAt,
      state.executeBefore,
      "bounded Purchase signing authorization",
    );
    return Object.freeze({
      ...state.material,
      preparedTransactionHash: new Uint8Array(state.digest),
    });
  } finally {
    state.digest.fill(0);
  }
}

export function captureBoundedPurchaseSigningAuthorizationForTest(input: {
  attemptId: `sha256:${string}`;
  capturedAt: number;
  executeBefore: string;
  party: string;
  preparedTransactionHash: Uint8Array;
  purchaseCommitment: `sha256:${string}`;
}): BoundedPurchaseSigningAuthorization {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("test signing authorization capture is unavailable");
  }
  if (
    !SHA256_PATTERN.test(input.attemptId) ||
    !SHA256_PATTERN.test(input.purchaseCommitment) ||
    !Number.isSafeInteger(input.capturedAt) ||
    !(input.preparedTransactionHash instanceof Uint8Array) ||
    input.preparedTransactionHash.byteLength !== 32
  ) {
    throw new Error("test signing authorization capture is invalid");
  }
  const executeBefore = input.executeBefore;
  canonicalTime(executeBefore, "test signing executeBefore");
  const party = identifier(input.party, "test signing Party");
  const authorization = Object.freeze({
    attemptId: input.attemptId,
    authorizationId: `sha256:${randomBytes(32).toString("hex")}` as const,
    executeBefore,
    party,
    purchaseCommitment: input.purchaseCommitment,
  }) as BoundedPurchaseSigningAuthorization;
  states.set(authorization, {
    capturedAt: input.capturedAt,
    digest: new Uint8Array(input.preparedTransactionHash),
    executeBefore,
    material: Object.freeze({
      attemptId: input.attemptId,
      party,
      purchaseCommitment: input.purchaseCommitment,
    }),
  });
  return authorization;
}
