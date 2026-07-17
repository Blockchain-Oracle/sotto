import {
  claimHumanPayerIdentity,
  createHumanPayerIdentityObserver,
} from "../src/human-payer-identity.js";

export const HUMAN_PAYER_FINGERPRINT = `1220${"a".repeat(64)}`;
export const HUMAN_PAYER = `sotto-external-payer::${HUMAN_PAYER_FINGERPRINT}`;
export const HUMAN_SYNCHRONIZER = `global-domain::1220${"b".repeat(64)}`;

export function humanPayerIdentityObserver() {
  return createHumanPayerIdentityObserver({
    readAuthenticatedSubject: async () => "validator-devnet-m2m",
    readPayerIdentity: async () => ({
      keyPurpose: "SIGNING",
      network: "canton:devnet",
      party: HUMAN_PAYER,
      publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
      publicKeyFingerprint: HUMAN_PAYER_FINGERPRINT,
      signatureFormat: "SIGNATURE_FORMAT_CONCAT",
      signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
      synchronizerId: HUMAN_SYNCHRONIZER,
      topologyHash: `1220${"c".repeat(64)}`,
    }),
  });
}

export async function authenticatedHumanPayerIdentity() {
  const observation = await humanPayerIdentityObserver()();
  return claimHumanPayerIdentity(observation);
}
