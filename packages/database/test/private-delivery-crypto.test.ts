import { createSecretKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import * as publicApi from "../src/index.js";
import { createPrivateDeliveryKeyring } from "../src/private-delivery-keyring.js";
import {
  openPrivateDeliveryPayload,
  sealPrivateDeliveryPayload,
} from "../src/private-delivery-crypto.js";
import { MAX_PRIVATE_DELIVERY_PAYLOAD_BYTES } from "../src/private-delivery-types.js";

const plaintext = new TextEncoder().encode(
  '{"schema":"sotto-private-delivery-request-v1","body":"private"}',
);
const aad = new TextEncoder().encode(
  'sotto-private-delivery-aad-v1\0{"attemptId":"sha256:test"}',
);

function keyring(marker = 7, id = "delivery-key-2026-07") {
  return createPrivateDeliveryKeyring({
    activeKeyId: id,
    keys: [{ id, key: createSecretKey(Buffer.alloc(32, marker)) }],
  });
}

function changed(value: Uint8Array): Uint8Array {
  const result = new Uint8Array(value);
  result[result.byteLength - 1] = result.at(-1)! ^ 1;
  return result;
}

describe("private delivery AEAD", () => {
  it("exports only keyring construction from the public package root", () => {
    expect(publicApi).toHaveProperty("createPrivateDeliveryKeyring");
    for (const name of [
      "openPrivateDeliveryPayload",
      "sealPrivateDeliveryPayload",
      "readPrivateDeliveryKeyring",
    ]) {
      expect(publicApi).not.toHaveProperty(name);
    }
  });

  it("seals with a random nonce and opens immutable copied bytes", () => {
    const keys = keyring();
    const first = sealPrivateDeliveryPayload(keys, plaintext, aad);
    const second = sealPrivateDeliveryPayload(keys, plaintext, aad);

    expect(first).toMatchObject({ keyId: "delivery-key-2026-07" });
    expect(first.nonce).toHaveLength(12);
    expect(first.authenticationTag).toHaveLength(16);
    expect(first.ciphertext).toHaveLength(plaintext.byteLength);
    expect(first.nonce).not.toEqual(second.nonce);
    expect(Object.isFrozen(first)).toBe(true);

    first.ciphertext.fill(0);
    expect(openPrivateDeliveryPayload(keys, first, aad)).toEqual(plaintext);
  });

  it("rotates keys while retaining explicit decrypt-only keys", () => {
    const old = sealPrivateDeliveryPayload(
      keyring(1, "delivery-key-old"),
      plaintext,
      aad,
    );
    const rotated = createPrivateDeliveryKeyring({
      activeKeyId: "delivery-key-new",
      keys: [
        {
          id: "delivery-key-new",
          key: createSecretKey(Buffer.alloc(32, 2)),
        },
        {
          id: "delivery-key-old",
          key: createSecretKey(Buffer.alloc(32, 1)),
        },
      ],
    });

    expect(openPrivateDeliveryPayload(rotated, old, aad)).toEqual(plaintext);
    expect(sealPrivateDeliveryPayload(rotated, plaintext, aad).keyId).toBe(
      "delivery-key-new",
    );
  });

  it("enforces exact key shapes and the delivery envelope byte limit", () => {
    expect(() =>
      createPrivateDeliveryKeyring({
        activeKeyId: "unsafe/key",
        keys: [{ id: "unsafe/key", key: createSecretKey(Buffer.alloc(32, 1)) }],
      }),
    ).toThrow("private delivery key configuration is invalid");
    const maximum = new Uint8Array(MAX_PRIVATE_DELIVERY_PAYLOAD_BYTES).fill(3);
    expect(
      openPrivateDeliveryPayload(
        keyring(),
        sealPrivateDeliveryPayload(keyring(), maximum, aad),
        aad,
      ),
    ).toEqual(maximum);
    expect(() =>
      sealPrivateDeliveryPayload(
        keyring(),
        new Uint8Array(MAX_PRIVATE_DELIVERY_PAYLOAD_BYTES + 1),
        aad,
      ),
    ).toThrow("private delivery input is invalid");
  });

  it("makes wrong key, AAD, nonce, tag, and ciphertext indistinguishable", () => {
    const envelope = sealPrivateDeliveryPayload(keyring(), plaintext, aad);
    const cases = [
      [keyring(8), envelope, aad],
      [keyring(), envelope, changed(aad)],
      [keyring(), { ...envelope, nonce: changed(envelope.nonce) }, aad],
      [
        keyring(),
        { ...envelope, authenticationTag: changed(envelope.authenticationTag) },
        aad,
      ],
      [
        keyring(),
        { ...envelope, ciphertext: changed(envelope.ciphertext) },
        aad,
      ],
    ] as const;

    for (const [keys, candidate, candidateAad] of cases) {
      expect(() =>
        openPrivateDeliveryPayload(keys, candidate, candidateAad),
      ).toThrow(
        expect.objectContaining({
          code: "PRIVATE_DELIVERY_AUTHENTICATION_FAILED",
          message: "private delivery authentication failed",
        }),
      );
    }
  });
});
