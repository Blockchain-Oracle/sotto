import type { BoundedPurchaseCommitment } from "./purchase-commitment.js";
import { PURCHASE_COMMITMENT_VERSION } from "./purchase-commitment.js";
import {
  exactKeys,
  objectValue,
  SHA256_PATTERN,
} from "./purchase-commitment-primitives.js";

export type BoundedPurchaseEvidence = Readonly<{
  attemptId: `sha256:${string}`;
  authorizationMode: "bounded-capability";
  bodyHash: `sha256:${string}`;
  challengeId: `sha256:${string}`;
  purchaseCommitment: `sha256:${string}`;
  requestCommitment: `sha256:${string}`;
  version: typeof PURCHASE_COMMITMENT_VERSION;
}>;

export function createBoundedPurchaseEvidence(
  input: BoundedPurchaseCommitment,
): BoundedPurchaseEvidence {
  const value = objectValue(input, "bounded purchase commitment");
  exactKeys(
    value,
    [
      "attemptId",
      "bodyHash",
      "canonicalBytes",
      "challengeId",
      "commitment",
      "expiresAt",
      "requestCommitment",
      "version",
    ],
    "bounded purchase commitment",
  );
  if (
    input.version !== PURCHASE_COMMITMENT_VERSION ||
    !SHA256_PATTERN.test(input.attemptId) ||
    !SHA256_PATTERN.test(input.bodyHash) ||
    !SHA256_PATTERN.test(input.challengeId) ||
    !SHA256_PATTERN.test(input.commitment) ||
    !SHA256_PATTERN.test(input.requestCommitment)
  ) {
    throw new Error("bounded purchase evidence identifiers are invalid");
  }
  return {
    attemptId: input.attemptId,
    authorizationMode: "bounded-capability",
    bodyHash: input.bodyHash,
    challengeId: input.challengeId,
    purchaseCommitment: input.commitment,
    requestCommitment: input.requestCommitment,
    version: input.version,
  };
}
