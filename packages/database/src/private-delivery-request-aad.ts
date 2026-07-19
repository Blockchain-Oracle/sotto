import { PRIVATE_DELIVERY_ALGORITHM } from "./private-delivery-types.js";

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const RAW_SHA256 = /^[0-9a-f]{64}$/u;
const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
const KEY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export const PRIVATE_DELIVERY_REQUEST_SCHEMA =
  "sotto-private-delivery-request-v1" as const;

const AAD_KEYS = [
  "attemptId",
  "encryptionGeneration",
  "keyId",
  "operationId",
  "ownerId",
  "purchaseCommitment",
  "requestCommitment",
  "requestHash",
  "resourceRevisionId",
  "sourceCommit",
].sort();

export type PrivateDeliveryRequestAadInput = Readonly<{
  attemptId: string;
  encryptionGeneration: number;
  keyId: string;
  operationId: string;
  ownerId: string;
  purchaseCommitment: string;
  requestCommitment: string;
  requestHash: string;
  resourceRevisionId: string;
  sourceCommit: string;
}>;

function invalid(): never {
  throw new Error("private delivery request AAD is invalid");
}

function snapshot(value: PrivateDeliveryRequestAadInput) {
  if (
    typeof value !== "object" ||
    value === null ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(AAD_KEYS)
  ) {
    invalid();
  }
  const copy = { ...value };
  if (
    !SHA256.test(copy.attemptId) ||
    !Number.isInteger(copy.encryptionGeneration) ||
    copy.encryptionGeneration < 1 ||
    copy.encryptionGeneration > 2_147_483_647 ||
    !KEY_ID.test(copy.keyId) ||
    !SHA256.test(copy.operationId) ||
    !UUID.test(copy.ownerId) ||
    !SHA256.test(copy.purchaseCommitment) ||
    !SHA256.test(copy.requestCommitment) ||
    !RAW_SHA256.test(copy.requestHash) ||
    !UUID.test(copy.resourceRevisionId) ||
    !SOURCE_COMMIT.test(copy.sourceCommit)
  ) {
    invalid();
  }
  return copy;
}

export function buildPrivateDeliveryRequestAad(
  input: PrivateDeliveryRequestAadInput,
): Uint8Array {
  const value = snapshot(input);
  const canonical = JSON.stringify({
    aeadAlgorithm: PRIVATE_DELIVERY_ALGORITHM,
    attemptId: value.attemptId,
    encryptionGeneration: value.encryptionGeneration,
    keyId: value.keyId,
    operationId: value.operationId,
    ownerId: value.ownerId,
    payloadSchema: PRIVATE_DELIVERY_REQUEST_SCHEMA,
    purchaseCommitment: value.purchaseCommitment,
    requestCommitment: value.requestCommitment,
    requestHash: value.requestHash,
    resourceRevisionId: value.resourceRevisionId,
    sourceCommit: value.sourceCommit,
  });
  return new TextEncoder().encode(
    `sotto-private-delivery-request-aad-v1\0${canonical}`,
  );
}
