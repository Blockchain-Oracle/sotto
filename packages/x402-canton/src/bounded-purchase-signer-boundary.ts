import { readBoundedPurchasePrepareRequest } from "./bounded-purchase-command.js";
import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import { requireBoundedPurchaseCommandPreferenceFresh } from "./bounded-purchase-command-preference.js";
import {
  claimHashVerifiedPreparedPurchase,
  verifyPreparedPurchaseHash,
} from "./prepared-purchase-hash.js";
import { requirePreparedPurchaseFresh } from "./prepared-purchase-freshness.js";
import {
  createPreparedPurchaseObserver,
  type PreparedPurchaseReader,
} from "./prepared-purchase-observation.js";
import {
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";

export type BoundedPurchaseAttemptClaim = Readonly<{
  attemptId: `sha256:${string}`;
  purchaseCommitment: `sha256:${string}`;
  preparedTransactionHash: string;
  executeBefore: string;
}>;

export type BoundedPurchaseSignerDependencies = Readonly<{
  readPreparedPurchase: PreparedPurchaseReader;
  recomputeOfficialHash: (
    preparedTransaction: Uint8Array,
  ) => Promise<Uint8Array>;
  claimAttempt: (claim: BoundedPurchaseAttemptClaim) => Promise<boolean>;
  signOpaque: (
    input: Readonly<{
      attemptId: `sha256:${string}`;
      preparedTransactionHash: string;
    }>,
  ) => Promise<Readonly<{ signingReference: string }>>;
}>;

export type BoundedPurchaseSigningReceipt = Readonly<{
  attemptId: `sha256:${string}`;
  purchaseCommitment: `sha256:${string}`;
  preparedTransactionHash: string;
  signingReference: string;
}>;

function dependencies(value: BoundedPurchaseSignerDependencies) {
  const record = objectValue(value, "bounded signer dependencies");
  exactKeys(
    record,
    [
      "readPreparedPurchase",
      "recomputeOfficialHash",
      "claimAttempt",
      "signOpaque",
    ],
    "bounded signer dependencies",
  );
  if (Object.values(record).some((entry) => typeof entry !== "function")) {
    throw new Error("bounded signer dependencies must be functions");
  }
  return value;
}

export async function signBoundedPurchase(
  request: BoundedPurchasePrepareRequest,
  candidateDependencies: BoundedPurchaseSignerDependencies,
): Promise<BoundedPurchaseSigningReceipt> {
  const ports = dependencies(candidateDependencies);
  readBoundedPurchasePrepareRequest(request);
  const observation = await createPreparedPurchaseObserver(
    ports.readPreparedPurchase,
  )(request);
  const verified = await verifyPreparedPurchaseHash(observation, {
    recomputeOfficialHash: ports.recomputeOfficialHash,
  });
  const state = claimHashVerifiedPreparedPurchase(verified);
  requireBoundedPurchaseCommandPreferenceFresh(state.intent);
  const claim = Object.freeze({
    attemptId: state.intent.attemptId,
    purchaseCommitment: state.intent.purchaseCommitment,
    preparedTransactionHash: state.preparedTransactionHash,
    executeBefore: state.intent.challenge.executeBefore,
  });
  if (!(await ports.claimAttempt(claim))) {
    throw new Error("bounded Purchase attempt is already claimed");
  }
  requirePreparedPurchaseFresh(
    state.capturedAt,
    state.intent.challenge.executeBefore,
    "bounded signer prepared Purchase",
  );
  requireBoundedPurchaseCommandPreferenceFresh(state.intent);
  const signed = await ports.signOpaque(
    Object.freeze({
      attemptId: claim.attemptId,
      preparedTransactionHash: claim.preparedTransactionHash,
    }),
  );
  const signingReference = identifier(
    signed.signingReference,
    "bounded Purchase signing reference",
    512,
  );
  return Object.freeze({
    attemptId: claim.attemptId,
    purchaseCommitment: claim.purchaseCommitment,
    preparedTransactionHash: claim.preparedTransactionHash,
    signingReference,
  });
}
