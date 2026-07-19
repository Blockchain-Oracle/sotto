import {
  createHash,
  createPublicKey,
  randomUUID,
  randomBytes,
  timingSafeEqual,
  verify as verifyEd25519,
} from "node:crypto";

export const SESSION_CHALLENGE_VERSION = "sotto-session-challenge-v1" as const;
export const SESSION_CHALLENGE_AUDIENCE = "sotto-owner-session" as const;
const CHALLENGE_TTL_MS = 5 * 60 * 1_000;
const MAX_PENDING_CHALLENGES = 4_096;
const PARTY = /^[^\s:]{1,128}::1220[0-9a-f]{64}$/u;
const FINGERPRINT = /^1220[0-9a-f]{64}$/u;

/**
 * S29 party-control challenge. The signed payload pins issuer (this API's
 * public origin), audience, version, subject (the exact party), a random
 * nonce, and an expiry — replay of a signature against another origin,
 * another party, or after expiry cannot verify.
 */
export type SessionChallenge = Readonly<{
  version: typeof SESSION_CHALLENGE_VERSION;
  challengeId: string;
  issuer: string;
  audience: typeof SESSION_CHALLENGE_AUDIENCE;
  subject: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}>;

export type ChallengeVerificationInput = Readonly<{
  challengeId: string;
  fingerprint: string;
  publicKeyBase64: string;
  signatureBase64: string;
}>;

export type ChallengeVerification =
  | Readonly<{ outcome: "verified"; partyId: string }>
  | Readonly<{ outcome: "rejected"; reason: string }>;

export function challengeBytes(challenge: SessionChallenge): Buffer {
  return Buffer.from(JSON.stringify(challenge), "utf8");
}

/**
 * Canton public-key fingerprint: the sha256 multihash (`1220…`) over the
 * 4-byte big-endian HashPurpose(12 = PublicKeyFingerprint) prefix plus the
 * raw Ed25519 public key. A pinned wallet-sdk vector locks this derivation
 * in tests; any drift fails closed (a real key is rejected, never a fake
 * key accepted).
 */
export function cantonPublicKeyFingerprint(publicKey: Buffer): string {
  const purpose = Buffer.alloc(4);
  purpose.writeUInt32BE(12);
  const digest = createHash("sha256")
    .update(purpose)
    .update(publicKey)
    .digest("hex");
  return `1220${digest}`;
}

export type ChallengeStore = Readonly<{
  issue(partyId: string): SessionChallenge;
  verify(input: ChallengeVerificationInput): ChallengeVerification;
}>;

function reject(reason: string): ChallengeVerification {
  return Object.freeze({ outcome: "rejected", reason });
}

/**
 * Process-local one-use challenge store for the single web-api process
 * (Q-006). A challenge leaves the store the moment verification is
 * attempted, so a captured signature can never be replayed — not even with
 * the same body milliseconds later.
 */
export function createChallengeStore(
  issuerOrigin: string,
  now: () => number = Date.now,
): ChallengeStore {
  const pending = new Map<string, SessionChallenge>();

  const prune = () => {
    const cutoff = now();
    for (const [id, challenge] of pending) {
      if (Date.parse(challenge.expiresAt) <= cutoff) pending.delete(id);
    }
    while (pending.size >= MAX_PENDING_CHALLENGES) {
      const oldest = pending.keys().next().value;
      if (oldest === undefined) break;
      pending.delete(oldest);
    }
  };

  return Object.freeze({
    issue: (partyId) => {
      if (!PARTY.test(partyId)) {
        throw new Error("challenge Party ID is not canonical");
      }
      prune();
      const issuedAt = now();
      const challenge: SessionChallenge = Object.freeze({
        version: SESSION_CHALLENGE_VERSION,
        challengeId: randomUUID(),
        issuer: issuerOrigin,
        audience: SESSION_CHALLENGE_AUDIENCE,
        subject: partyId,
        nonce: randomBytes(32).toString("hex"),
        issuedAt: new Date(issuedAt).toISOString(),
        expiresAt: new Date(issuedAt + CHALLENGE_TTL_MS).toISOString(),
      });
      pending.set(challenge.challengeId, challenge);
      return challenge;
    },
    verify: (input) => {
      const challenge = pending.get(input.challengeId);
      // One-use: the challenge is consumed on the first verification
      // attempt, verified or not.
      pending.delete(input.challengeId);
      if (challenge === undefined) {
        return reject("challenge-unknown-or-used");
      }
      if (Date.parse(challenge.expiresAt) <= now()) {
        return reject("challenge-expired");
      }
      if (!FINGERPRINT.test(input.fingerprint)) {
        return reject("fingerprint-invalid");
      }
      const publicKey = Buffer.from(input.publicKeyBase64, "base64");
      if (
        publicKey.byteLength !== 32 ||
        publicKey.toString("base64") !== input.publicKeyBase64
      ) {
        return reject("public-key-invalid");
      }
      const derived = cantonPublicKeyFingerprint(publicKey);
      const provided = Buffer.from(input.fingerprint, "utf8");
      if (
        provided.byteLength !== derived.length ||
        !timingSafeEqual(Buffer.from(derived, "utf8"), provided)
      ) {
        return reject("fingerprint-key-mismatch");
      }
      if (!challenge.subject.endsWith(`::${input.fingerprint}`)) {
        return reject("party-namespace-mismatch");
      }
      const signature = Buffer.from(input.signatureBase64, "base64");
      if (
        signature.byteLength !== 64 ||
        signature.toString("base64") !== input.signatureBase64
      ) {
        return reject("signature-invalid");
      }
      const key = createPublicKey({
        format: "jwk",
        key: { crv: "Ed25519", kty: "OKP", x: publicKey.toString("base64url") },
      });
      const verified = verifyEd25519(
        null,
        challengeBytes(challenge),
        key,
        signature,
      );
      if (!verified) return reject("signature-mismatch");
      return Object.freeze({
        outcome: "verified",
        partyId: challenge.subject,
      });
    },
  });
}
