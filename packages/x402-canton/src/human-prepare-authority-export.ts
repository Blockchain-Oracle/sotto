import { readHumanPurchaseIntentPersistenceState } from "./human-purchase-ledger-intent.js";
import {
  HUMAN_PREPARE_AUTHORITY_VERSION,
  MAX_HUMAN_PREPARE_AUTHORITY_BYTES,
  type HumanPrepareAuthorityPayload,
} from "./human-prepare-authority-types.js";

function base64(value: Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

export function exportHumanPrepareAuthorityPlaintext(
  candidateIntent: unknown,
): Uint8Array {
  const { authority, commitment, intent } =
    readHumanPurchaseIntentPersistenceState(candidateIntent);
  const payload: HumanPrepareAuthorityPayload = {
    version: HUMAN_PREPARE_AUTHORITY_VERSION,
    purchase: {
      version: commitment.version,
      attemptId: commitment.attemptId,
      canonicalBytes: base64(commitment.canonicalBytes),
      challengeId: commitment.challengeId,
      commitment: commitment.commitment,
      expiresAt: commitment.expiresAt,
      requestCommitment: commitment.requestCommitment,
    },
    requestBindingCanonicalBytes: base64(
      authority.persistence.requestBindingCanonicalBytes,
    ),
    paymentChallengeBytes: base64(authority.persistence.challengeBytes),
    requestDisplay: authority.requestDisplay,
    connector: authority.persistence.connector,
    trustedConfiguration: authority.persistence.trustedConfiguration,
    payerIdentity: intent.payerIdentity,
    packageSelection: intent.packageSelection,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (bytes.byteLength > MAX_HUMAN_PREPARE_AUTHORITY_BYTES) {
    throw new Error("human prepare authority plaintext exceeds 196608 bytes");
  }
  return bytes;
}
