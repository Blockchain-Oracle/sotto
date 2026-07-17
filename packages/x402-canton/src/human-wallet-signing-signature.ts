import {
  readCapabilityWalletSignatureBytes,
  verifyCapabilityWalletSignatureBytes,
} from "./capability-wallet-signature-crypto.js";
import { parseCapabilityWalletRegisteredPublicKey } from "./capability-wallet-signature-validation.js";
import type { HumanWalletConnectorPreflightAuthority } from "./human-wallet-connector-preflight-state.js";
import type {
  HumanWalletRegisteredPublicKeyQuery,
  HumanWalletSignatureEnvelope,
  HumanWalletSigningDependencies,
} from "./human-wallet-signing-types.js";

function requireExpectedEnvelope(
  authority: HumanWalletConnectorPreflightAuthority,
  envelope: HumanWalletSignatureEnvelope,
): HumanWalletRegisteredPublicKeyQuery {
  const identity = authority.identity;
  if (
    envelope.party !== identity.party ||
    envelope.signedBy !== identity.publicKeyFingerprint ||
    envelope.signatureFormat !== identity.signatureFormat ||
    envelope.signingAlgorithm !== identity.signingAlgorithm
  ) {
    throw new Error("human wallet signature does not match the payer identity");
  }
  return Object.freeze({
    keyPurpose: identity.keyPurpose,
    network: identity.network,
    party: identity.party,
    publicKeyFormat: identity.publicKeyFormat,
    signatureFormat: identity.signatureFormat,
    signedBy: identity.publicKeyFingerprint,
    signingAlgorithm: identity.signingAlgorithm,
    subjectHash: identity.subjectHash,
    synchronizerId: identity.synchronizerId,
    topologyHash: identity.topologyHash,
  });
}

export async function verifyHumanWalletPreparedSignature(
  authority: HumanWalletConnectorPreflightAuthority,
  envelope: HumanWalletSignatureEnvelope,
  preparedTransactionHash: `sha256:${string}`,
  resolveRegisteredPublicKey: HumanWalletSigningDependencies["resolveRegisteredPublicKey"],
  signal: AbortSignal,
): Promise<void> {
  const query = requireExpectedEnvelope(authority, envelope);
  let signature: Buffer;
  try {
    signature = readCapabilityWalletSignatureBytes(envelope);
  } catch {
    throw new Error("human wallet signature verification failed");
  }
  let keyValue: unknown;
  try {
    keyValue = await resolveRegisteredPublicKey(
      query,
      Object.freeze({ signal }),
    );
  } catch {
    throw new Error("human wallet registered public-key lookup failed");
  }
  let registeredKey: ReturnType<
    typeof parseCapabilityWalletRegisteredPublicKey
  >;
  try {
    registeredKey = parseCapabilityWalletRegisteredPublicKey(keyValue, query);
  } catch {
    throw new Error("human wallet registered public key is invalid");
  }
  const digest = Buffer.from(
    preparedTransactionHash.slice("sha256:".length),
    "hex",
  );
  if (digest.length !== 32) {
    throw new Error("human wallet prepared transaction hash is invalid");
  }
  try {
    verifyCapabilityWalletSignatureBytes(
      envelope,
      signature,
      digest,
      registeredKey,
    );
  } catch {
    throw new Error("human wallet signature verification failed");
  }
}
