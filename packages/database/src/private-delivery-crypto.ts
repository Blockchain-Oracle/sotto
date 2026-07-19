import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type KeyObject,
} from "node:crypto";
import {
  immutablePrivateDeliveryEnvelope,
  privateDeliveryInputBytes,
  readPrivateDeliveryEnvelope,
  zeroPrivateDeliveryEnvelope,
} from "./private-delivery-envelope.js";
import { readPrivateDeliveryKeyring } from "./private-delivery-keyring.js";
import {
  PRIVATE_DELIVERY_ALGORITHM,
  PrivateDeliveryAuthenticationError,
  PrivateDeliveryKeyUnavailableError,
  type PrivateDeliveryEnvelope,
  type PrivateDeliveryKeyring,
} from "./private-delivery-types.js";

const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function seal(
  key: KeyObject,
  keyId: string,
  plaintext: Buffer,
  aad: Buffer,
): PrivateDeliveryEnvelope {
  const nonce = randomBytes(NONCE_BYTES);
  let encrypted: Buffer | undefined;
  let final: Buffer | undefined;
  let ciphertext: Buffer | undefined;
  let authenticationTag: Buffer | undefined;
  try {
    const cipher = createCipheriv(PRIVATE_DELIVERY_ALGORITHM, key, nonce, {
      authTagLength: TAG_BYTES,
    });
    cipher.setAAD(aad, { plaintextLength: plaintext.byteLength });
    encrypted = cipher.update(plaintext);
    final = cipher.final();
    ciphertext = Buffer.concat([encrypted, final]);
    authenticationTag = cipher.getAuthTag();
    return immutablePrivateDeliveryEnvelope({
      keyId,
      nonce,
      authenticationTag,
      ciphertext,
    });
  } finally {
    nonce.fill(0);
    encrypted?.fill(0);
    final?.fill(0);
    ciphertext?.fill(0);
    authenticationTag?.fill(0);
  }
}

export function sealPrivateDeliveryPayload(
  keyring: PrivateDeliveryKeyring,
  plaintext: Uint8Array,
  aad: Uint8Array,
): PrivateDeliveryEnvelope {
  const state = readPrivateDeliveryKeyring(keyring);
  const plaintextCopy = privateDeliveryInputBytes(plaintext);
  const aadCopy = privateDeliveryInputBytes(aad);
  try {
    return seal(
      state.keys.get(state.activeKeyId)!,
      state.activeKeyId,
      plaintextCopy,
      aadCopy,
    );
  } finally {
    plaintextCopy.fill(0);
    aadCopy.fill(0);
  }
}

export function openPrivateDeliveryPayload(
  keyring: PrivateDeliveryKeyring,
  envelope: PrivateDeliveryEnvelope,
  aad: Uint8Array,
): Uint8Array {
  const state = readPrivateDeliveryEnvelope(envelope);
  const key = readPrivateDeliveryKeyring(keyring).keys.get(state.keyId);
  if (key === undefined) {
    zeroPrivateDeliveryEnvelope(state);
    throw new PrivateDeliveryKeyUnavailableError();
  }
  let aadCopy: Buffer | undefined;
  let opened: Buffer | undefined;
  let final: Buffer | undefined;
  let plaintext: Buffer | undefined;
  try {
    aadCopy = privateDeliveryInputBytes(aad);
    const decipher = createDecipheriv(
      PRIVATE_DELIVERY_ALGORITHM,
      key,
      state.nonce,
      { authTagLength: TAG_BYTES },
    );
    decipher.setAAD(aadCopy, { plaintextLength: state.ciphertext.byteLength });
    decipher.setAuthTag(state.authenticationTag);
    opened = decipher.update(state.ciphertext);
    final = decipher.final();
    plaintext = Buffer.concat([opened, final]);
    return new Uint8Array(plaintext);
  } catch {
    throw new PrivateDeliveryAuthenticationError();
  } finally {
    aadCopy?.fill(0);
    zeroPrivateDeliveryEnvelope(state);
    opened?.fill(0);
    final?.fill(0);
    plaintext?.fill(0);
  }
}
