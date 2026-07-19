import {
  encodeHumanDeliveryRequest,
  parseHumanDeliveryRequestPlaintext,
} from "./human-delivery-request-codec.js";
import type { HumanPaymentDeliveryRequest } from "./human-delivery-request-types.js";

const deliveryAuthorities = new WeakMap<object, Uint8Array>();

export function bindHumanDeliveryRequestAuthority(
  commitment: object,
  request: HumanPaymentDeliveryRequest,
  expected: Readonly<{
    bodyHash: `sha256:${string}`;
    requestCommitment: `sha256:${string}`;
  }>,
): void {
  if (deliveryAuthorities.has(commitment)) {
    throw new Error("human delivery request authority is already bound");
  }
  const plaintext = encodeHumanDeliveryRequest(request);
  const material = parseHumanDeliveryRequestPlaintext(plaintext);
  if (
    material.bodyHash !== expected.bodyHash ||
    material.requestCommitment !== expected.requestCommitment
  ) {
    throw new Error("human delivery request authority is inconsistent");
  }
  deliveryAuthorities.set(commitment, plaintext);
}

export function readHumanDeliveryRequestAuthority(
  commitment: unknown,
): Uint8Array {
  if (typeof commitment !== "object" || commitment === null) {
    throw new Error("human delivery request is not authenticated");
  }
  const plaintext = deliveryAuthorities.get(commitment);
  if (plaintext === undefined) {
    throw new Error("human delivery request is not authenticated");
  }
  return Uint8Array.from(plaintext);
}
