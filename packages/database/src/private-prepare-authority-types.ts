import type { KeyObject } from "node:crypto";

export const MAX_PRIVATE_PREPARE_AUTHORITY_BYTES = 196_608;
export const PRIVATE_PREPARE_AUTHORITY_ALGORITHM = "aes-256-gcm" as const;

declare const prepareAuthorityKeyringBrand: unique symbol;

export type PrepareAuthorityKeyring = Readonly<{
  [prepareAuthorityKeyringBrand]: true;
}>;

export type PrepareAuthorityKeyringInput = Readonly<{
  activeKeyId: string;
  keys: ReadonlyArray<Readonly<{ id: string; key: KeyObject }>>;
}>;

export type PrepareAuthorityEnvelope = Readonly<{
  keyId: string;
  nonce: Uint8Array;
  authenticationTag: Uint8Array;
  ciphertext: Uint8Array;
}>;

export class PrepareAuthorityAuthenticationError extends Error {
  readonly code = "PURCHASE_AUTHORITY_AUTHENTICATION_FAILED";

  constructor() {
    super("private prepare authority authentication failed");
    this.name = "PrepareAuthorityAuthenticationError";
  }
}

export class PrepareAuthorityKeyUnavailableError extends Error {
  readonly code = "PURCHASE_AUTHORITY_KEY_UNAVAILABLE";

  constructor() {
    super("private prepare authority key is unavailable");
    this.name = "PrepareAuthorityKeyUnavailableError";
  }
}
