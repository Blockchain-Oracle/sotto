import {
  CAPABILITY_WALLET_ECDSA_SIGNATURE_FORMAT,
  CAPABILITY_WALLET_ECDSA_SIGNING_ALGORITHM,
  CAPABILITY_WALLET_ED25519_SIGNATURE_FORMAT,
  CAPABILITY_WALLET_ED25519_SIGNING_ALGORITHM,
  type CapabilityWalletCapabilities,
  type CapabilityWalletSignatureEnvelope,
  type CapabilityWalletSignatureFormat,
  type CapabilityWalletSigningAlgorithm,
} from "./capability-wallet-connector-types.js";

export function capabilityWalletSignatureFormat(
  value: unknown,
): CapabilityWalletSignatureFormat {
  if (
    value !== CAPABILITY_WALLET_ED25519_SIGNATURE_FORMAT &&
    value !== CAPABILITY_WALLET_ECDSA_SIGNATURE_FORMAT
  ) {
    throw new Error("capability wallet signature format is unsupported");
  }
  return value;
}

export function capabilityWalletSigningAlgorithm(
  value: unknown,
): CapabilityWalletSigningAlgorithm {
  if (
    value !== CAPABILITY_WALLET_ED25519_SIGNING_ALGORITHM &&
    value !== CAPABILITY_WALLET_ECDSA_SIGNING_ALGORITHM
  ) {
    throw new Error("capability wallet signing algorithm is unsupported");
  }
  return value;
}

export function isSupportedCapabilityWalletSignatureScheme(
  signatureFormat: CapabilityWalletSignatureFormat,
  signingAlgorithm: CapabilityWalletSigningAlgorithm,
): boolean {
  return (
    (signatureFormat === CAPABILITY_WALLET_ED25519_SIGNATURE_FORMAT &&
      signingAlgorithm === CAPABILITY_WALLET_ED25519_SIGNING_ALGORITHM) ||
    (signatureFormat === CAPABILITY_WALLET_ECDSA_SIGNATURE_FORMAT &&
      signingAlgorithm === CAPABILITY_WALLET_ECDSA_SIGNING_ALGORITHM)
  );
}

export function requireNegotiatedCapabilityWalletSignatureScheme(
  capabilities: CapabilityWalletCapabilities,
  signature: CapabilityWalletSignatureEnvelope,
): void {
  if (
    !capabilities.signatureFormats.includes(signature.signatureFormat) ||
    !capabilities.signingAlgorithms.includes(signature.signingAlgorithm)
  ) {
    throw new Error(
      "capability wallet response signature scheme was not negotiated",
    );
  }
}
