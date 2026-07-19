import { createPrivateKey, sign as signEd25519 } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  cantonPublicKeyFingerprint,
  challengeBytes,
  createChallengeStore,
} from "../src/auth/challenge.js";

// RFC 8032 Ed25519 test vector 2 keypair; the official fingerprint below
// was produced by @canton-network/wallet-sdk `keys.fingerprint` for this
// exact public key, pinning the Canton derivation.
const SEED_HEX =
  "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb";
const PUBLIC_HEX =
  "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c";
const OFFICIAL_FINGERPRINT =
  "1220a5d7d280f5a16ae97e7fce02c6f148159a71a1fa9523cebfbca018fe5c0d7d88";

const publicKey = Buffer.from(PUBLIC_HEX, "hex");
const privateKey = createPrivateKey({
  format: "jwk",
  key: {
    crv: "Ed25519",
    kty: "OKP",
    d: Buffer.from(SEED_HEX, "hex").toString("base64url"),
    x: publicKey.toString("base64url"),
  },
});
const PARTY = `sotto-owner::${OFFICIAL_FINGERPRINT}`;

function verifyInput(store: ReturnType<typeof createChallengeStore>) {
  const challenge = store.issue(PARTY);
  const signature = signEd25519(null, challengeBytes(challenge), privateKey);
  return {
    challengeId: challenge.challengeId,
    fingerprint: OFFICIAL_FINGERPRINT,
    publicKeyBase64: publicKey.toString("base64"),
    signatureBase64: signature.toString("base64"),
  };
}

describe("canton public-key fingerprint", () => {
  it("matches the pinned wallet-sdk vector", () => {
    expect(cantonPublicKeyFingerprint(publicKey)).toBe(OFFICIAL_FINGERPRINT);
  });
});

describe("session challenge store", () => {
  it("verifies a real signature over the exact challenge", () => {
    const store = createChallengeStore("http://127.0.0.1:4400");
    const result = store.verify(verifyInput(store));
    expect(result).toEqual({ outcome: "verified", partyId: PARTY });
  });

  it("rejects a replay of a consumed challenge", () => {
    const store = createChallengeStore("http://127.0.0.1:4400");
    const input = verifyInput(store);
    expect(store.verify(input).outcome).toBe("verified");
    const replay = store.verify(input);
    expect(replay).toEqual({
      outcome: "rejected",
      reason: "challenge-unknown-or-used",
    });
  });

  it("consumes the challenge even when verification fails", () => {
    const store = createChallengeStore("http://127.0.0.1:4400");
    const input = verifyInput(store);
    const tampered = {
      ...input,
      signatureBase64: Buffer.alloc(64, 7).toString("base64"),
    };
    expect(store.verify(tampered).outcome).toBe("rejected");
    expect(store.verify(input)).toEqual({
      outcome: "rejected",
      reason: "challenge-unknown-or-used",
    });
  });

  it("rejects an expired challenge", () => {
    let now = Date.now();
    const store = createChallengeStore("http://127.0.0.1:4400", () => now);
    const input = verifyInput(store);
    now += 6 * 60 * 1_000;
    expect(store.verify(input)).toEqual({
      outcome: "rejected",
      reason: "challenge-expired",
    });
  });

  it("rejects a key whose fingerprint does not derive", () => {
    const store = createChallengeStore("http://127.0.0.1:4400");
    const input = {
      ...verifyInput(store),
      fingerprint: `1220${"b".repeat(64)}`,
    };
    expect(store.verify(input).outcome).toBe("rejected");
  });

  it("rejects a party whose namespace is not the signing key", () => {
    const store = createChallengeStore("http://127.0.0.1:4400");
    const foreign = store.issue(`sotto-owner::1220${"c".repeat(64)}`);
    const signature = signEd25519(null, challengeBytes(foreign), privateKey);
    const result = store.verify({
      challengeId: foreign.challengeId,
      fingerprint: OFFICIAL_FINGERPRINT,
      publicKeyBase64: publicKey.toString("base64"),
      signatureBase64: signature.toString("base64"),
    });
    expect(result).toEqual({
      outcome: "rejected",
      reason: "party-namespace-mismatch",
    });
  });

  it("rejects a signature minted for a different challenge", () => {
    const store = createChallengeStore("http://127.0.0.1:4400");
    const first = store.issue(PARTY);
    const second = store.issue(PARTY);
    const signature = signEd25519(null, challengeBytes(first), privateKey);
    const result = store.verify({
      challengeId: second.challengeId,
      fingerprint: OFFICIAL_FINGERPRINT,
      publicKeyBase64: publicKey.toString("base64"),
      signatureBase64: signature.toString("base64"),
    });
    expect(result).toEqual({
      outcome: "rejected",
      reason: "signature-mismatch",
    });
  });
});
