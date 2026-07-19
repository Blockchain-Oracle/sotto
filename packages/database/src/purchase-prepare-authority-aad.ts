import { PRIVATE_PREPARE_AUTHORITY_ALGORITHM } from "./private-prepare-authority-types.js";

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const RAW_SHA256 = /^[0-9a-f]{64}$/u;
const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
const KEY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export const PRIVATE_PREPARE_AUTHORITY_SCHEMA =
  "sotto-private-prepare-authority-v1" as const;
const AAD_KEYS = [
  "attemptId",
  "encryptionGeneration",
  "keyId",
  "operationId",
  "ownerId",
  "purchaseCommitment",
  "requestHash",
  "resourceRevisionId",
  "sourceCommit",
].sort();

export type PrivatePrepareAuthorityAadInput = Readonly<{
  attemptId: string;
  encryptionGeneration: number;
  keyId: string;
  operationId: string;
  ownerId: string;
  purchaseCommitment: string;
  requestHash: string;
  resourceRevisionId: string;
  sourceCommit: string;
}>;

function valid(input: PrivatePrepareAuthorityAadInput): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    SHA256.test(input.attemptId) &&
    Number.isInteger(input.encryptionGeneration) &&
    input.encryptionGeneration >= 1 &&
    input.encryptionGeneration <= 2_147_483_647 &&
    KEY_ID.test(input.keyId) &&
    SHA256.test(input.operationId) &&
    UUID.test(input.ownerId) &&
    SHA256.test(input.purchaseCommitment) &&
    RAW_SHA256.test(input.requestHash) &&
    UUID.test(input.resourceRevisionId) &&
    SOURCE_COMMIT.test(input.sourceCommit)
  );
}

function snapshot(
  input: PrivatePrepareAuthorityAadInput,
): PrivatePrepareAuthorityAadInput {
  if (
    typeof input !== "object" ||
    input === null ||
    JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(AAD_KEYS)
  ) {
    throw new Error("private prepare authority AAD is invalid");
  }
  return {
    attemptId: input.attemptId,
    encryptionGeneration: input.encryptionGeneration,
    keyId: input.keyId,
    operationId: input.operationId,
    ownerId: input.ownerId,
    purchaseCommitment: input.purchaseCommitment,
    requestHash: input.requestHash,
    resourceRevisionId: input.resourceRevisionId,
    sourceCommit: input.sourceCommit,
  };
}

export function buildPrivatePrepareAuthorityAad(
  input: PrivatePrepareAuthorityAadInput,
): Uint8Array {
  const value = snapshot(input);
  if (!valid(value)) {
    throw new Error("private prepare authority AAD is invalid");
  }
  const canonical = JSON.stringify({
    aeadAlgorithm: PRIVATE_PREPARE_AUTHORITY_ALGORITHM,
    attemptId: value.attemptId,
    authoritySchema: PRIVATE_PREPARE_AUTHORITY_SCHEMA,
    encryptionGeneration: value.encryptionGeneration,
    keyId: value.keyId,
    operationId: value.operationId,
    ownerId: value.ownerId,
    purchaseCommitment: value.purchaseCommitment,
    requestHash: value.requestHash,
    resourceRevisionId: value.resourceRevisionId,
    sourceCommit: value.sourceCommit,
  });
  return new TextEncoder().encode(
    `sotto-private-prepare-authority-aad-v1\0${canonical}`,
  );
}
