import { describe, expect, it } from "vitest";
import * as publicApi from "../src/index.js";
import {
  openPrepareAuthority,
  sealPrepareAuthority,
} from "../src/private-prepare-authority-crypto.js";
import {
  aad,
  changed,
  envelopeWith,
  keyring,
  plaintext,
} from "./private-prepare-authority-crypto.fixtures.js";

const AUTHENTICATION_ERROR = {
  code: "PURCHASE_AUTHORITY_AUTHENTICATION_FAILED",
  message: "private prepare authority authentication failed",
};

describe("private prepare authority failure boundary", () => {
  it("keeps raw cryptography and key inspection off the public package root", () => {
    for (const name of [
      "openPrepareAuthority",
      "sealPrepareAuthority",
      "readPrivatePrepareAuthorityActiveKeyId",
      "PrepareAuthorityAuthenticationError",
      "PrepareAuthorityKeyUnavailableError",
    ]) {
      expect(publicApi).not.toHaveProperty(name);
    }
  });

  it("makes wrong key, AAD, nonce, tag, and ciphertext indistinguishable", () => {
    const envelope = sealPrepareAuthority(keyring(), plaintext, aad);
    const cases = [
      [keyring(2), envelope, aad],
      [keyring(), envelope, changed(aad)],
      [
        keyring(),
        envelopeWith(envelope, { nonce: changed(envelope.nonce) }),
        aad,
      ],
      [
        keyring(),
        envelopeWith(envelope, {
          authenticationTag: changed(envelope.authenticationTag),
        }),
        aad,
      ],
      [
        keyring(),
        envelopeWith(envelope, {
          ciphertext: changed(envelope.ciphertext),
        }),
        aad,
      ],
    ] as const;

    for (const [keys, candidate, candidateAad] of cases) {
      expect(() => openPrepareAuthority(keys, candidate, candidateAad)).toThrow(
        expect.objectContaining(AUTHENTICATION_ERROR),
      );
    }
  });

  it("reports an unavailable legacy key through only its internal code", () => {
    const envelope = sealPrepareAuthority(
      keyring(1, "missing-legacy-key"),
      plaintext,
      aad,
    );

    expect(() =>
      openPrepareAuthority(keyring(2, "current-key"), envelope, aad),
    ).toThrow(
      expect.objectContaining({
        code: "PURCHASE_AUTHORITY_KEY_UNAVAILABLE",
        message: "private prepare authority key is unavailable",
      }),
    );
  });

  it("opens reconstructed envelopes without leaking private inputs", () => {
    const secret = "private-authority-never-log-this";
    const secretPlaintext = new TextEncoder().encode(secret);
    const keys = keyring();
    const envelope = sealPrepareAuthority(keys, secretPlaintext, aad);
    const structural = {
      ...envelope,
      nonce: envelope.nonce,
      authenticationTag: envelope.authenticationTag,
      ciphertext: envelope.ciphertext,
    };

    expect(openPrepareAuthority(keys, structural, aad)).toEqual(
      secretPlaintext,
    );

    let thrown: unknown;
    try {
      openPrepareAuthority(
        keys,
        { ...structural, ciphertext: changed(structural.ciphertext) },
        aad,
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject(AUTHENTICATION_ERROR);
    expect(String(thrown)).not.toContain(secret);
    expect(String(thrown)).not.toContain("prepare-key-2026-07");
  });

  it("rejects malformed reconstructed envelopes generically", () => {
    expect(() =>
      openPrepareAuthority(
        keyring(),
        {
          keyId: "unsafe/key",
          nonce: new Uint8Array(12),
          authenticationTag: new Uint8Array(16),
          ciphertext: new Uint8Array(1),
        },
        aad,
      ),
    ).toThrow("private prepare authority authentication failed");
  });
});
