import { safePrivateDeliveryKeyId } from "./private-delivery-keyring.js";
import {
  MAX_PRIVATE_DELIVERY_PAYLOAD_BYTES,
  PrivateDeliveryAuthenticationError,
  type PrivateDeliveryEnvelope,
} from "./private-delivery-types.js";

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const ENVELOPE_KEYS = [
  "keyId",
  "nonce",
  "authenticationTag",
  "ciphertext",
].sort();

export type PrivateDeliveryEnvelopeBytes = Readonly<{
  keyId: string;
  nonce: Buffer;
  authenticationTag: Buffer;
  ciphertext: Buffer;
}>;

function bytes(
  value: unknown,
  minimum: number,
  maximum: number,
): Buffer | undefined {
  if (
    !(value instanceof Uint8Array) ||
    value.buffer instanceof SharedArrayBuffer ||
    value.byteLength < minimum ||
    value.byteLength > maximum
  ) {
    return undefined;
  }
  return Buffer.from(value);
}

export function privateDeliveryInputBytes(value: unknown): Buffer {
  const result = bytes(value, 1, MAX_PRIVATE_DELIVERY_PAYLOAD_BYTES);
  if (result === undefined) {
    throw new Error("private delivery input is invalid");
  }
  return result;
}

export function readPrivateDeliveryEnvelope(
  value: unknown,
): PrivateDeliveryEnvelopeBytes {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      JSON.stringify(Object.keys(value).sort()) !==
        JSON.stringify(ENVELOPE_KEYS)
    ) {
      throw new Error();
    }
    const record = value as Record<string, unknown>;
    const nonce = bytes(record.nonce, NONCE_BYTES, NONCE_BYTES);
    const authenticationTag = bytes(
      record.authenticationTag,
      TAG_BYTES,
      TAG_BYTES,
    );
    const ciphertext = bytes(
      record.ciphertext,
      1,
      MAX_PRIVATE_DELIVERY_PAYLOAD_BYTES,
    );
    if (
      !safePrivateDeliveryKeyId(record.keyId) ||
      nonce === undefined ||
      authenticationTag === undefined ||
      ciphertext === undefined
    ) {
      throw new Error();
    }
    return { keyId: record.keyId, nonce, authenticationTag, ciphertext };
  } catch {
    throw new PrivateDeliveryAuthenticationError();
  }
}

export function immutablePrivateDeliveryEnvelope(
  value: PrivateDeliveryEnvelopeBytes,
): PrivateDeliveryEnvelope {
  const nonce = new Uint8Array(value.nonce);
  const authenticationTag = new Uint8Array(value.authenticationTag);
  const ciphertext = new Uint8Array(value.ciphertext);
  return Object.freeze({
    keyId: value.keyId,
    get nonce() {
      return new Uint8Array(nonce);
    },
    get authenticationTag() {
      return new Uint8Array(authenticationTag);
    },
    get ciphertext() {
      return new Uint8Array(ciphertext);
    },
  });
}

export function zeroPrivateDeliveryEnvelope(
  value: PrivateDeliveryEnvelopeBytes,
): void {
  value.nonce.fill(0);
  value.authenticationTag.fill(0);
  value.ciphertext.fill(0);
}
