import {
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";
import {
  capabilityWalletSignatureFormat,
  capabilityWalletSigningAlgorithm,
  isSupportedCapabilityWalletSignatureScheme,
} from "./capability-wallet-signature-scheme.js";
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
      "keyPurpose",
      "network",
      "party",
      "publicKeyFormat",
      "publicKeyFingerprint",
      "signatureFormat",
      "signingAlgorithm",
      "synchronizerId",
      "topologyHash",
    ],
    "human payer identity",
  );
  const party = identifier(record.party, "human payer Party", 512);
  const signatureFormat = capabilityWalletSignatureFormat(
    record.signatureFormat,
  );
  const signingAlgorithm = capabilityWalletSigningAlgorithm(
    record.signingAlgorithm,
  );
  if (
    record.keyPurpose !== "SIGNING" ||
    !isSupportedCapabilityWalletSignatureScheme(
      signatureFormat,
      signingAlgorithm,
    )
  ) {
    throw new Error("human payer key must use a supported signing purpose");
  }
  const expectedPublicKeyFormat =
    signingAlgorithm === "SIGNING_ALGORITHM_SPEC_ED25519"
      ? "PUBLIC_KEY_FORMAT_RAW"
      : "PUBLIC_KEY_FORMAT_DER_SPKI";
  if (record.publicKeyFormat !== expectedPublicKeyFormat) {
    throw new Error("human payer public-key format does not match its scheme");
  }
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
    keyPurpose: "SIGNING" as const,
    network: cantonNetwork(record.network),
    party,
    publicKeyFormat: expectedPublicKeyFormat,
    publicKeyFingerprint: fingerprint as `1220${string}`,
    signatureFormat,
    signingAlgorithm,
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
