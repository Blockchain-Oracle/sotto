import { createSecretKey } from "node:crypto";
import {
  createPrepareAuthorityKeyring,
  type PrepareAuthorityKeyring,
} from "../src/index.js";
import type { PrepareAuthorityEnvelope } from "../src/private-prepare-authority-types.js";

export const aad = new TextEncoder().encode(
  'sotto-private-prepare-authority-aad-v1\0{"attemptId":"sha256:test"}',
);
export const plaintext = new TextEncoder().encode(
  '{"schema":"sotto-private-prepare-authority-v1","intent":"private"}',
);

export function secretKey(marker: number, length = 32) {
  return createSecretKey(Buffer.alloc(length, marker));
}

export function keyring(
  marker = 1,
  keyId = "prepare-key-2026-07",
  legacy: ReadonlyArray<Readonly<{ keyId: string; marker: number }>> = [],
): PrepareAuthorityKeyring {
  return createPrepareAuthorityKeyring({
    activeKeyId: keyId,
    keys: [
      { id: keyId, key: secretKey(marker) },
      ...legacy.map((candidate) => ({
        id: candidate.keyId,
        key: secretKey(candidate.marker),
      })),
    ],
  });
}

export function changed(
  value: Uint8Array,
  index = value.byteLength - 1,
): Uint8Array {
  const result = new Uint8Array(value);
  result[index] = result[index]! ^ 1;
  return result;
}

export function envelopeWith(
  envelope: PrepareAuthorityEnvelope,
  overrides: Partial<{
    keyId: string;
    nonce: Uint8Array;
    authenticationTag: Uint8Array;
    ciphertext: Uint8Array;
  }>,
): PrepareAuthorityEnvelope {
  return {
    keyId: overrides.keyId ?? envelope.keyId,
    nonce: overrides.nonce ?? envelope.nonce,
    authenticationTag:
      overrides.authenticationTag ?? envelope.authenticationTag,
    ciphertext: overrides.ciphertext ?? envelope.ciphertext,
  };
}
