import { describe, expect, it } from "vitest";
import { createPrepareAuthorityKeyring } from "../src/index.js";
import {
  openPrepareAuthority,
  sealPrepareAuthority,
} from "../src/private-prepare-authority-crypto.js";
import { readPrivatePrepareAuthorityActiveKeyId } from "../src/private-prepare-authority-keyring.js";
import { MAX_PRIVATE_PREPARE_AUTHORITY_BYTES } from "../src/private-prepare-authority-types.js";
import {
  aad,
  keyring,
  plaintext,
  secretKey,
} from "./private-prepare-authority-crypto.fixtures.js";

describe("private prepare authority AEAD", () => {
  it("seals with the active key and opens immutable copied bytes", () => {
    const keys = keyring();
    expect(readPrivatePrepareAuthorityActiveKeyId(keys)).toBe(
      "prepare-key-2026-07",
    );
    const first = sealPrepareAuthority(keys, plaintext, aad);
    const second = sealPrepareAuthority(keys, plaintext, aad);

    expect(first).toMatchObject({
      keyId: "prepare-key-2026-07",
    });
    expect(first.nonce).toHaveLength(12);
    expect(first.authenticationTag).toHaveLength(16);
    expect(first.ciphertext).toHaveLength(plaintext.byteLength);
    expect(first.nonce).not.toEqual(second.nonce);
    expect(Object.isFrozen(first)).toBe(true);

    const exposed = first.ciphertext;
    exposed.fill(0);
    expect(openPrepareAuthority(keys, first, aad)).toEqual(plaintext);
  });

  it("resolves legacy decrypt-only keys without changing the active key", () => {
    const oldEnvelope = sealPrepareAuthority(
      keyring(1, "prepare-key-old"),
      plaintext,
      aad,
    );
    const rotated = keyring(2, "prepare-key-new", [
      { keyId: "prepare-key-old", marker: 1 },
    ]);

    expect(openPrepareAuthority(rotated, oldEnvelope, aad)).toEqual(plaintext);
    expect(sealPrepareAuthority(rotated, plaintext, aad).keyId).toBe(
      "prepare-key-new",
    );
  });

  it("enforces exact keys, safe IDs, and plaintext/ciphertext bounds", () => {
    expect(() =>
      createPrepareAuthorityKeyring({
        activeKeyId: "unsafe/key",
        keys: [{ id: "unsafe/key", key: secretKey(1) }],
      }),
    ).toThrow("private prepare authority key configuration is invalid");
    expect(() =>
      createPrepareAuthorityKeyring({
        activeKeyId: "safe-key",
        keys: [{ id: "safe-key", key: secretKey(1, 31) }],
      }),
    ).toThrow("private prepare authority key configuration is invalid");
    expect(() =>
      sealPrepareAuthority(
        keyring(),
        new Uint8Array(MAX_PRIVATE_PREPARE_AUTHORITY_BYTES + 1),
        aad,
      ),
    ).toThrow("private prepare authority input is invalid");
    const maximum = new Uint8Array(MAX_PRIVATE_PREPARE_AUTHORITY_BYTES).fill(7);
    const maximumEnvelope = sealPrepareAuthority(keyring(), maximum, aad);
    expect(maximumEnvelope.ciphertext).toHaveLength(
      MAX_PRIVATE_PREPARE_AUTHORITY_BYTES,
    );
    expect(openPrepareAuthority(keyring(), maximumEnvelope, aad)).toEqual(
      maximum,
    );
    expect(() =>
      openPrepareAuthority(
        keyring(),
        {
          keyId: "safe-key",
          nonce: new Uint8Array(12),
          authenticationTag: new Uint8Array(16),
          ciphertext: new Uint8Array(MAX_PRIVATE_PREPARE_AUTHORITY_BYTES + 1),
        },
        aad,
      ),
    ).toThrow("private prepare authority authentication failed");
  });
});
