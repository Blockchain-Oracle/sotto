import {
  assertAuthenticHumanPurchase,
  HUMAN_PURCHASE_COMMITMENT_VERSION,
  type HumanPurchaseCommitment,
} from "./human-purchase-commitment.js";
import {
  exactKeys,
  objectValue,
  SHA256_PATTERN,
} from "./purchase-commitment-primitives.js";

export type HumanPurchaseEvidence = Readonly<{
  attemptId: `sha256:${string}`;
  authorizationMode: "human-wallet";
  challengeId: `sha256:${string}`;
  purchaseCommitment: `sha256:${string}`;
  requestCommitment: `sha256:${string}`;
  version: typeof HUMAN_PURCHASE_COMMITMENT_VERSION;
}>;

export function createHumanPurchaseEvidence(
  input: HumanPurchaseCommitment,
): HumanPurchaseEvidence {
  assertAuthenticHumanPurchase(input);
  const value = objectValue(input, "human purchase commitment");
  exactKeys(
    value,
    [
      "attemptId",
      "canonicalBytes",
      "challengeId",
      "commitment",
      "expiresAt",
      "requestCommitment",
      "version",
    ],
    "human purchase commitment",
  );
  if (
    input.version !== HUMAN_PURCHASE_COMMITMENT_VERSION ||
    !SHA256_PATTERN.test(input.attemptId) ||
    !SHA256_PATTERN.test(input.challengeId) ||
    !SHA256_PATTERN.test(input.commitment) ||
    !SHA256_PATTERN.test(input.requestCommitment)
  ) {
    throw new Error("human purchase evidence identifiers are invalid");
  }
  return Object.freeze({
    attemptId: input.attemptId,
    authorizationMode: "human-wallet",
    challengeId: input.challengeId,
    purchaseCommitment: input.commitment,
    requestCommitment: input.requestCommitment,
    version: input.version,
  });
}
