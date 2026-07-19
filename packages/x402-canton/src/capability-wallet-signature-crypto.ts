import {
  createPublicKey,
  verify as verifySignature,
  type KeyObject,
} from "node:crypto";
import type { CapabilityWalletSignatureEnvelope } from "./capability-wallet-connector-types.js";
import type { CapabilityWalletPublicKeyFormat } from "./capability-wallet-signature-types.js";
import { canonicalBase64 } from "./capability-wallet-signature-validation.js";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function requireCanonicalEcdsaDer(signature: Buffer): void {
  if (
    signature.length < 8 ||
    signature.length > 72 ||
    signature[0] !== 0x30 ||
    signature[1] !== signature.length - 2
  ) {
    throw new Error("wallet ECDSA signature is not canonical DER");
  }
  let offset = 2;
  for (let index = 0; index < 2; index += 1) {
    if (signature[offset] !== 0x02) {
      throw new Error("wallet ECDSA signature is not canonical DER");
    }
    const length = signature[offset + 1];
    const first = signature[offset + 2];
    if (
      length === undefined ||
      first === undefined ||
      length < 1 ||
      length > 33 ||
      offset + 2 + length > signature.length ||
      (first & 0x80) !== 0 ||
      (length > 1 && first === 0 && (signature[offset + 3]! & 0x80) === 0)
    ) {
      throw new Error("wallet ECDSA signature is not canonical DER");
    }
    offset += 2 + length;
  }
  if (offset !== signature.length) {
    throw new Error("wallet ECDSA signature is not canonical DER");
  }
}

function publicKey(
  bytes: Buffer,
  format: CapabilityWalletPublicKeyFormat,
): KeyObject {
  const key = createPublicKey({
    key:
      format === "PUBLIC_KEY_FORMAT_RAW"
        ? Buffer.concat([ED25519_SPKI_PREFIX, bytes])
        : bytes,
    format: "der",
    type: "spki",
  });
  if (
    (format === "PUBLIC_KEY_FORMAT_RAW" &&
      (bytes.length !== 32 || key.asymmetricKeyType !== "ed25519")) ||
    (format === "PUBLIC_KEY_FORMAT_DER_SPKI" &&
      (key.asymmetricKeyType !== "ec" ||
        key.asymmetricKeyDetails?.namedCurve !== "prime256v1"))
  ) {
    throw new Error("registered public key does not match the signing scheme");
  }
  return key;
}

export function readCapabilityWalletSignatureBytes(
  envelope: CapabilityWalletSignatureEnvelope,
): Buffer {
  const isEd25519 =
    envelope.signingAlgorithm === "SIGNING_ALGORITHM_SPEC_ED25519";
  const signature = canonicalBase64(
    envelope.signature,
    "wallet signature",
    isEd25519 ? 64 : 72,
  );
  if (isEd25519 && signature.length !== 64) {
    throw new Error("wallet Ed25519 signature must contain exactly 64 bytes");
  }
  if (!isEd25519) requireCanonicalEcdsaDer(signature);
  return signature;
}

export function verifyCapabilityWalletSignatureBytes(
  envelope: CapabilityWalletSignatureEnvelope,
  signature: Uint8Array,
  digest: Uint8Array,
  registeredKey: Readonly<{
    publicKey: Buffer;
    publicKeyFormat: CapabilityWalletPublicKeyFormat;
  }>,
): void {
  const isEd25519 =
    envelope.signingAlgorithm === "SIGNING_ALGORITHM_SPEC_ED25519";
  const verified = verifySignature(
    isEd25519 ? null : "sha256",
    digest,
    publicKey(registeredKey.publicKey, registeredKey.publicKeyFormat),
    signature,
  );
  if (!verified) {
    throw new Error("capability wallet signature verification failed");
  }
}
