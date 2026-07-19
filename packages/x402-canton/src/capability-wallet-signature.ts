import {
  claimApprovedCapabilityWalletSigningSession,
  readApprovedCapabilityWalletSigningSession,
} from "./capability-wallet-signing-session.js";
import type { CapabilityWalletApprovedSessionState } from "./capability-wallet-connector-types.js";
import {
  readCapabilityWalletSignatureBytes,
  verifyCapabilityWalletSignatureBytes,
} from "./capability-wallet-signature-crypto.js";
import type {
  CapabilityWalletSignatureVerificationDependencies,
  VerifiedCapabilityWalletSignature,
  VerifiedCapabilityWalletSignatureClaim,
} from "./capability-wallet-signature-types.js";
import {
  cantonFingerprint,
  parseCapabilityWalletRegisteredPublicKey,
} from "./capability-wallet-signature-validation.js";

type VerifiedState = Readonly<{
  approved: CapabilityWalletApprovedSessionState;
  claimed: { value: boolean };
}>;

const states = new WeakMap<object, VerifiedState>();
const MAXIMUM_CLOCK_ROLLBACK_MS = 5_000;

function requireActive(state: CapabilityWalletApprovedSessionState): number {
  const now = Date.now();
  if (now < state.createdAt - MAXIMUM_CLOCK_ROLLBACK_MS) {
    throw new Error("verified capability wallet signature clock rollback");
  }
  const remaining = state.expiresAt - now;
  if (remaining < 1) {
    throw new Error("verified capability wallet signature has expired");
  }
  return remaining;
}

async function resolveBeforeExpiry(
  state: CapabilityWalletApprovedSessionState,
  resolve: (signal: AbortSignal) => Promise<unknown>,
): Promise<unknown> {
  const remaining = requireActive(state);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolve(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error("registered wallet public-key lookup timed out"));
          controller.abort();
        }, remaining);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  }
}

export async function verifyCapabilityWalletSignature(
  session: unknown,
  dependencies: CapabilityWalletSignatureVerificationDependencies,
): Promise<VerifiedCapabilityWalletSignature> {
  if (typeof dependencies.resolveRegisteredPublicKey !== "function") {
    throw new Error("registered wallet public-key resolver is required");
  }
  const approved = readApprovedCapabilityWalletSigningSession(session);
  const envelope = approved.signature;
  if (envelope.party !== approved.payerParty) {
    throw new Error("capability wallet signature Party is not the payer");
  }
  const signatureBytes = readCapabilityWalletSignatureBytes(envelope);
  const signedBy = cantonFingerprint(
    envelope.signedBy,
    "wallet signer fingerprint",
  );
  const query = Object.freeze({
    party: approved.payerParty,
    signatureFormat: envelope.signatureFormat,
    signedBy,
    signingAlgorithm: envelope.signingAlgorithm,
  });
  const keyValue = await resolveBeforeExpiry(approved, (signal) =>
    dependencies.resolveRegisteredPublicKey(query, Object.freeze({ signal })),
  );
  requireActive(approved);
  const key = parseCapabilityWalletRegisteredPublicKey(keyValue, query);
  const digest = Buffer.from(
    approved.preparedTransactionHash.slice("sha256:".length),
    "hex",
  );
  if (digest.length !== 32) {
    throw new Error("prepared transaction hash is invalid");
  }
  verifyCapabilityWalletSignatureBytes(envelope, signatureBytes, digest, key);
  const claimed = claimApprovedCapabilityWalletSigningSession(session);
  if (
    claimed.sessionId !== approved.sessionId ||
    claimed.preparedTransactionHash !== approved.preparedTransactionHash
  ) {
    throw new Error(
      "approved capability wallet session changed during verification",
    );
  }
  const verified = Object.freeze({
    outcome: "verified" as const,
    party: approved.payerParty,
    sessionId: approved.sessionId,
    signatureFormat: envelope.signatureFormat,
    signedBy,
    signingAlgorithm: envelope.signingAlgorithm,
  }) as VerifiedCapabilityWalletSignature;
  states.set(verified, { approved: claimed, claimed: { value: false } });
  return verified;
}

/** @internal Execute transport only. */
export function claimVerifiedCapabilityWalletSignature(
  candidate: unknown,
): VerifiedCapabilityWalletSignatureClaim {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error(
      "verified capability wallet signature is not authenticated",
    );
  }
  const state = states.get(candidate);
  if (state === undefined) {
    throw new Error(
      "verified capability wallet signature is not authenticated",
    );
  }
  if (state.claimed.value) {
    throw new Error("verified capability wallet signature is already claimed");
  }
  requireActive(state.approved);
  state.claimed.value = true;
  const { signature } = state.approved;
  return Object.freeze({
    capabilityIntentHash: state.approved.capabilityIntentHash,
    connectorId: state.approved.connectorId,
    connectorKind: state.approved.connectorKind,
    network: state.approved.network,
    origin: state.approved.origin,
    packageId: state.approved.packageId,
    party: state.approved.payerParty,
    preparedTransaction: new Uint8Array(state.approved.preparedTransaction),
    preparedTransactionHash: state.approved.preparedTransactionHash,
    sessionId: state.approved.sessionId,
    signature: signature.signature,
    signatureFormat: signature.signatureFormat,
    signedBy: signature.signedBy,
    signingAlgorithm: signature.signingAlgorithm,
    synchronizerId: state.approved.synchronizerId,
  });
}
