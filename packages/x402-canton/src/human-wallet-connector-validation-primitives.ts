import { types } from "node:util";
import type {
  HumanWalletConnectorKind,
  HumanWalletSigningKey,
} from "./human-wallet-connector-types.js";
import {
  identifier,
  RAW_SHA256_PATTERN,
} from "./purchase-commitment-primitives.js";
import { exactWalletDataRecord } from "./wallet-data-record.js";

const MAXIMUM_CAPABILITY_VALUES = 16;
const FINGERPRINT = /^1220[0-9a-f]{64}$/u;

export type ParsedHumanWalletSigningKey = Readonly<{
  fingerprint: string;
  publicKeyFormat: string;
  purpose: string;
  signatureFormat: string;
  signingAlgorithm: string;
}>;

export function exactHumanWalletStrings(
  value: unknown,
  label: string,
  validate: (entry: unknown) => string = (entry) =>
    identifier(entry, label, 512),
): string[] {
  if (
    types.isProxy(value) ||
    !Array.isArray(value) ||
    value.length > MAXIMUM_CAPABILITY_VALUES
  ) {
    throw new Error(`${label} must be a bounded array`);
  }
  const expectedKeys = [
    ...Array.from({ length: value.length }, (_, index) => String(index)),
    "length",
  ].sort();
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== "string") ||
    JSON.stringify([...ownKeys].sort()) !== JSON.stringify(expectedKeys)
  ) {
    throw new Error(`${label} must be an exact array`);
  }
  const result = Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error(`${label} must use own data properties`);
    }
    return validate(descriptor.value);
  });
  if (new Set(result).size !== result.length) {
    throw new Error(`${label} must be unique`);
  }
  return result;
}

export function humanWalletConnectorKind(
  value: unknown,
): HumanWalletConnectorKind {
  if (value !== "openrpc" && value !== "wallet-sdk") {
    throw new Error("human wallet connector kind is unsupported");
  }
  return value;
}

export function humanWalletConnectorOrigin(value: unknown): string {
  const origin = identifier(value, "human wallet connector origin", 512);
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error("human wallet connector origin is invalid");
  }
  if (
    (parsed.protocol !== "https:" &&
      parsed.protocol !== "openrpc:" &&
      parsed.protocol !== "wallet:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    parsed.host === ""
  ) {
    throw new Error("human wallet connector origin is not public-safe");
  }
  const canonical = `${parsed.protocol}//${parsed.host}`;
  if (origin !== canonical && origin !== `${canonical}/`) {
    throw new Error("human wallet connector origin is not canonical");
  }
  return canonical;
}

export function humanWalletPackageId(value: unknown): string {
  if (typeof value !== "string" || !RAW_SHA256_PATTERN.test(value)) {
    throw new Error("human wallet package ID is invalid");
  }
  return value;
}

export function humanWalletNetwork(value: unknown): `canton:${string}` {
  const network = identifier(value, "human wallet network", 256);
  if (!network.startsWith("canton:") || network.length === "canton:".length) {
    throw new Error("human wallet network must be a Canton network");
  }
  return network as `canton:${string}`;
}

export function parseHumanWalletSigningKey(
  value: unknown,
): ParsedHumanWalletSigningKey {
  const key = exactWalletDataRecord(
    value,
    [
      "fingerprint",
      "publicKeyFormat",
      "purpose",
      "signatureFormat",
      "signingAlgorithm",
    ],
    "human wallet signing key",
  );
  const fingerprint = identifier(
    key.fingerprint,
    "human wallet key fingerprint",
    132,
  );
  if (!FINGERPRINT.test(fingerprint)) {
    throw new Error("human wallet key fingerprint is invalid");
  }
  return Object.freeze({
    fingerprint,
    publicKeyFormat: identifier(
      key.publicKeyFormat,
      "human wallet public-key format",
      64,
    ),
    purpose: identifier(key.purpose, "human wallet key purpose", 32),
    signatureFormat: identifier(
      key.signatureFormat,
      "human wallet signature format",
      64,
    ),
    signingAlgorithm: identifier(
      key.signingAlgorithm,
      "human wallet signing algorithm",
      64,
    ),
  });
}

export function isSupportedHumanWalletSigningKey(
  key: ParsedHumanWalletSigningKey,
): key is HumanWalletSigningKey {
  return (
    key.purpose === "SIGNING" &&
    ((key.publicKeyFormat === "PUBLIC_KEY_FORMAT_RAW" &&
      key.signatureFormat === "SIGNATURE_FORMAT_CONCAT" &&
      key.signingAlgorithm === "SIGNING_ALGORITHM_SPEC_ED25519") ||
      (key.publicKeyFormat === "PUBLIC_KEY_FORMAT_DER_SPKI" &&
        key.signatureFormat === "SIGNATURE_FORMAT_DER" &&
        key.signingAlgorithm === "SIGNING_ALGORITHM_SPEC_EC_DSA_SHA_256"))
  );
}
