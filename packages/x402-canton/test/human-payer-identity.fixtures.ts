import {
  claimHumanPayerIdentity,
  createHumanPayerIdentityObserver,
} from "../src/human-payer-identity.js";

export const HUMAN_PAYER_FINGERPRINT = `1220${"a".repeat(64)}`;
export const HUMAN_PAYER = `sotto-external-payer::${HUMAN_PAYER_FINGERPRINT}`;
export const HUMAN_SYNCHRONIZER = `global-domain::1220${"b".repeat(64)}`;

export async function authenticatedHumanPayerIdentity() {
  const observation = await createHumanPayerIdentityObserver({
    readAuthenticatedSubject: async () => "validator-devnet-m2m",
    readPayerIdentity: async () => ({
      network: "canton:devnet",
      party: HUMAN_PAYER,
      publicKeyFingerprint: HUMAN_PAYER_FINGERPRINT,
      synchronizerId: HUMAN_SYNCHRONIZER,
      topologyHash: `1220${"c".repeat(64)}`,
    }),
  })();
  return claimHumanPayerIdentity(observation);
}
