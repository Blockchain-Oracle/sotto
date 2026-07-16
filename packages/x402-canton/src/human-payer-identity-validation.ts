import {
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";
import {
  HUMAN_PAYER_IDENTITY_VERSION,
  type AuthenticatedHumanPayerIdentity,
  type HumanPayerIdentityReader,
} from "./human-payer-identity.js";

const FINGERPRINT = /^1220[0-9a-f]{64}$/u;

export function validateHumanPayerIdentityReader(
  value: HumanPayerIdentityReader,
): HumanPayerIdentityReader {
  const record = objectValue(value, "human payer identity reader");
  exactKeys(
    record,
    ["readAuthenticatedSubject", "readPayerIdentity"],
    "human payer identity reader",
  );
  if (
    typeof record.readAuthenticatedSubject !== "function" ||
    typeof record.readPayerIdentity !== "function"
  ) {
    throw new Error("human payer identity reader functions are required");
  }
  return value;
}

function cantonNetwork(value: unknown): `canton:${string}` {
  const network = identifier(value, "human payer network", 256);
  if (!network.startsWith("canton:") || network.length === "canton:".length) {
    throw new Error("human payer network must be a Canton network");
  }
  return network as `canton:${string}`;
}

export function parseHumanPayerIdentity(
  value: unknown,
  subjectHash: `sha256:${string}`,
  acquiredAt: string,
): AuthenticatedHumanPayerIdentity {
  const record = objectValue(value, "human payer identity");
  exactKeys(
    record,
    [
      "network",
      "party",
      "publicKeyFingerprint",
      "synchronizerId",
      "topologyHash",
    ],
    "human payer identity",
  );
  const party = identifier(record.party, "human payer Party", 512);
  const fingerprint = record.publicKeyFingerprint;
  if (
    typeof fingerprint !== "string" ||
    !FINGERPRINT.test(fingerprint) ||
    !party.startsWith("sotto-") ||
    !party.endsWith(`::${fingerprint}`)
  ) {
    throw new Error("human payer Party and fingerprint do not match");
  }
  return Object.freeze({
    acquiredAt,
    network: cantonNetwork(record.network),
    party,
    publicKeyFingerprint: fingerprint as `1220${string}`,
    subjectHash,
    synchronizerId: identifier(
      record.synchronizerId,
      "human payer synchronizer",
      512,
    ),
    topologyHash: identifier(
      record.topologyHash,
      "human payer topology hash",
      1_024,
    ),
    version: HUMAN_PAYER_IDENTITY_VERSION,
  });
}
