import { createHash } from "node:crypto";
import type {
  CapabilityWalletPublicKeyFormat,
  CapabilityWalletRegisteredPublicKeyQuery,
} from "./capability-wallet-signature-types.js";
import { exactWalletDataRecord } from "./wallet-data-record.js";

const CANONICAL_BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const CANTON_FINGERPRINT = /^1220[0-9a-f]{64}$/u;
const FINGERPRINT_PURPOSE = Buffer.from([0, 0, 0, 12]);

function text(value: unknown, label: string, maximumLength: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

export function canonicalBase64(
  value: unknown,
  label: string,
  maximumBytes: number,
): Buffer {
  const encoded = text(value, label, Math.ceil(maximumBytes / 3) * 4);
  if (!CANONICAL_BASE64.test(encoded)) {
    throw new Error(`${label} must be canonical base64`);
  }
  const decoded = Buffer.from(encoded, "base64");
  if (
    decoded.length === 0 ||
    decoded.length > maximumBytes ||
    decoded.toString("base64") !== encoded
  ) {
    throw new Error(`${label} must be bounded canonical base64`);
  }
  return decoded;
}

export function cantonFingerprint(value: unknown, label: string): string {
  if (typeof value !== "string" || !CANTON_FINGERPRINT.test(value)) {
    throw new Error(`${label} must be a Canton public-key fingerprint`);
  }
  return value;
}

export function computeCantonPublicKeyFingerprint(
  publicKey: Uint8Array,
): string {
  return `1220${createHash("sha256")
    .update(FINGERPRINT_PURPOSE)
    .update(publicKey)
    .digest("hex")}`;
}

export function parseCapabilityWalletRegisteredPublicKey(
  value: unknown,
  query: CapabilityWalletRegisteredPublicKeyQuery,
): Readonly<{
  fingerprint: string;
  publicKey: Buffer;
  publicKeyFormat: CapabilityWalletPublicKeyFormat;
}> {
  const record = exactWalletDataRecord(
    value,
    ["fingerprint", "publicKey", "publicKeyFormat"],
    "registered capability wallet public key",
  );
  const fingerprint = cantonFingerprint(
    record.fingerprint,
    "registered public-key fingerprint",
  );
  if (fingerprint !== query.signedBy) {
    throw new Error(
      "registered public-key fingerprint does not match signedBy",
    );
  }
  const expectedFormat =
    query.signingAlgorithm === "SIGNING_ALGORITHM_SPEC_ED25519"
      ? "PUBLIC_KEY_FORMAT_RAW"
      : "PUBLIC_KEY_FORMAT_DER_SPKI";
  if (record.publicKeyFormat !== expectedFormat) {
    throw new Error("registered public-key format does not match the scheme");
  }
  const publicKey = canonicalBase64(
    record.publicKey,
    "registered public key",
    expectedFormat === "PUBLIC_KEY_FORMAT_RAW" ? 32 : 256,
  );
  if (computeCantonPublicKeyFingerprint(publicKey) !== fingerprint) {
    throw new Error("registered public-key fingerprint is invalid");
  }
  return Object.freeze({
    fingerprint,
    publicKey,
    publicKeyFormat: expectedFormat,
  });
}
