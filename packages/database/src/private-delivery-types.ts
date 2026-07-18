import type { KeyObject } from "node:crypto";

export const MAX_PRIVATE_DELIVERY_PAYLOAD_BYTES = 2_100_000;
export const PRIVATE_DELIVERY_ALGORITHM = "aes-256-gcm" as const;

declare const privateDeliveryKeyringBrand: unique symbol;

export type PrivateDeliveryKeyring = Readonly<{
  [privateDeliveryKeyringBrand]: true;
}>;

export type PrivateDeliveryKeyringInput = Readonly<{
  activeKeyId: string;
  keys: ReadonlyArray<Readonly<{ id: string; key: KeyObject }>>;
}>;

export type PrivateDeliveryEnvelope = Readonly<{
  keyId: string;
  nonce: Uint8Array;
  authenticationTag: Uint8Array;
  ciphertext: Uint8Array;
}>;

export class PrivateDeliveryAuthenticationError extends Error {
  readonly code = "PRIVATE_DELIVERY_AUTHENTICATION_FAILED";

  constructor() {
    super("private delivery authentication failed");
    this.name = "PrivateDeliveryAuthenticationError";
  }
}

export class PrivateDeliveryKeyUnavailableError extends Error {
  readonly code = "PRIVATE_DELIVERY_KEY_UNAVAILABLE";

  constructor() {
    super("private delivery key is unavailable");
    this.name = "PrivateDeliveryKeyUnavailableError";
  }
}
