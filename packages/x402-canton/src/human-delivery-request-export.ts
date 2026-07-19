import { readHumanDeliveryRequestAuthority } from "./human-delivery-request-authority.js";
import { parseHumanDeliveryRequestPlaintext } from "./human-delivery-request-codec.js";
import { readHumanPurchaseIntentPersistenceState } from "./human-purchase-ledger-intent.js";

export function exportHumanDeliveryRequestPlaintext(
  candidateIntent: unknown,
): Uint8Array {
  const { commitment, intent } =
    readHumanPurchaseIntentPersistenceState(candidateIntent);
  const plaintext = readHumanDeliveryRequestAuthority(commitment);
  const request = parseHumanDeliveryRequestPlaintext(plaintext);
  if (
    request.requestCommitment !== intent.request.requestCommitment ||
    request.bodyHash !== intent.request.bodyHash ||
    request.method !== intent.request.method
  ) {
    throw new Error("human delivery request authority is inconsistent");
  }
  return plaintext;
}
