import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type KeyObject,
} from "node:crypto";
import { readPrepareAuthorityKeyring } from "./private-prepare-authority-keyring.js";
import {
  immutablePrepareAuthorityEnvelope,
  prepareAuthorityInputBytes,
  readPrepareAuthorityEnvelope,
  zeroPrepareAuthorityEnvelope,
} from "./private-prepare-authority-envelope.js";
import {
  PRIVATE_PREPARE_AUTHORITY_ALGORITHM,
  PrepareAuthorityAuthenticationError,
  PrepareAuthorityKeyUnavailableError,
  type PrepareAuthorityEnvelope,
  type PrepareAuthorityKeyring,
} from "./private-prepare-authority-types.js";

const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function seal(
  key: KeyObject,
  keyId: string,
  plaintext: Buffer,
  aad: Buffer,
): PrepareAuthorityEnvelope {
  const nonce = randomBytes(NONCE_BYTES);
  let encrypted: Buffer | undefined;
  let final: Buffer | undefined;
  let ciphertext: Buffer | undefined;
  let authenticationTag: Buffer | undefined;
  try {
    const cipher = createCipheriv(
      PRIVATE_PREPARE_AUTHORITY_ALGORITHM,
      key,
      nonce,
      { authTagLength: TAG_BYTES },
    );
    cipher.setAAD(aad, { plaintextLength: plaintext.byteLength });
    encrypted = cipher.update(plaintext);
    final = cipher.final();
    ciphertext = Buffer.concat([encrypted, final]);
    authenticationTag = cipher.getAuthTag();
    return immutablePrepareAuthorityEnvelope({
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

export function sealPrepareAuthority(
  keyring: PrepareAuthorityKeyring,
  plaintext: Uint8Array,
  aad: Uint8Array,
): PrepareAuthorityEnvelope {
  const state = readPrepareAuthorityKeyring(keyring);
  const plaintextCopy = prepareAuthorityInputBytes(plaintext);
  const aadCopy = prepareAuthorityInputBytes(aad);
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

export function openPrepareAuthority(
  keyring: PrepareAuthorityKeyring,
  envelope: PrepareAuthorityEnvelope,
  aad: Uint8Array,
): Uint8Array {
  const state = readPrepareAuthorityEnvelope(envelope);
  const key = readPrepareAuthorityKeyring(keyring).keys.get(state.keyId);
  if (key === undefined) {
    zeroPrepareAuthorityEnvelope(state);
    throw new PrepareAuthorityKeyUnavailableError();
  }
  let aadCopy: Buffer | undefined;
  let opened: Buffer | undefined;
  let final: Buffer | undefined;
  let plaintext: Buffer | undefined;
  try {
    aadCopy = prepareAuthorityInputBytes(aad);
    const decipher = createDecipheriv(
      PRIVATE_PREPARE_AUTHORITY_ALGORITHM,
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
    throw new PrepareAuthorityAuthenticationError();
  } finally {
    aadCopy?.fill(0);
    zeroPrepareAuthorityEnvelope(state);
    opened?.fill(0);
    final?.fill(0);
    plaintext?.fill(0);
  }
}
