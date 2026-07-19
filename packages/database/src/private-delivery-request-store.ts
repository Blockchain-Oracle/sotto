import { timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import {
  openPrivateDeliveryPayload,
  sealPrivateDeliveryPayload,
} from "./private-delivery-crypto.js";
import { readPrivateDeliveryActiveKeyId } from "./private-delivery-keyring.js";
import {
  buildPrivateDeliveryRequestAad,
  PRIVATE_DELIVERY_REQUEST_SCHEMA,
  type PrivateDeliveryRequestAadInput,
} from "./private-delivery-request-aad.js";
import {
  PRIVATE_DELIVERY_ALGORITHM,
  type PrivateDeliveryEnvelope,
  type PrivateDeliveryKeyring,
} from "./private-delivery-types.js";

const MAXIMUM_REQUEST_PLAINTEXT_BYTES = 1_200_000;

type RequestSource = Omit<
  PrivateDeliveryRequestAadInput,
  "encryptionGeneration" | "keyId"
>;

type RequestRow = Readonly<{
  algorithm: string;
  authenticationTag: Buffer;
  ciphertext: Buffer;
  encryptionGeneration: number;
  keyId: string;
  nonce: Buffer;
  requestCommitment: string;
  schema: string;
}>;

type SealedRequest = Readonly<{
  aad: PrivateDeliveryRequestAadInput;
  envelope: PrivateDeliveryEnvelope;
}>;

function aadInput(
  source: RequestSource,
  keyId: string,
  encryptionGeneration = 1,
): PrivateDeliveryRequestAadInput {
  return {
    attemptId: source.attemptId,
    encryptionGeneration,
    keyId,
    operationId: source.operationId,
    ownerId: source.ownerId,
    purchaseCommitment: source.purchaseCommitment,
    requestCommitment: source.requestCommitment,
    requestHash: source.requestHash,
    resourceRevisionId: source.resourceRevisionId,
    sourceCommit: source.sourceCommit,
  };
}

export function sealPrivateDeliveryRequest(
  source: RequestSource,
  plaintext: Uint8Array,
  keyring: PrivateDeliveryKeyring,
): SealedRequest {
  if (plaintext.byteLength > MAXIMUM_REQUEST_PLAINTEXT_BYTES) {
    throw new Error("private delivery request exceeds its storage bound");
  }
  const aad = aadInput(source, readPrivateDeliveryActiveKeyId(keyring));
  return Object.freeze({
    aad,
    envelope: sealPrivateDeliveryPayload(
      keyring,
      plaintext,
      buildPrivateDeliveryRequestAad(aad),
    ),
  });
}

export async function insertPrivateDeliveryRequest(
  client: PoolClient,
  source: RequestSource,
  sealed: SealedRequest,
): Promise<void> {
  await client.query(
    `INSERT INTO sotto.private_attempt_payloads
      (attempt_id, request_commitment, payload_schema, aead_algorithm,
       key_id, encryption_generation, nonce, authentication_tag, ciphertext)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      source.attemptId,
      source.requestCommitment,
      PRIVATE_DELIVERY_REQUEST_SCHEMA,
      PRIVATE_DELIVERY_ALGORITHM,
      sealed.envelope.keyId,
      sealed.aad.encryptionGeneration,
      sealed.envelope.nonce,
      sealed.envelope.authenticationTag,
      sealed.envelope.ciphertext,
    ],
  );
}

async function requestRow(
  client: PoolClient,
  source: RequestSource,
): Promise<RequestRow> {
  const result = await client.query<RequestRow>(
    `SELECT payload_schema AS schema, aead_algorithm AS algorithm,
      key_id AS "keyId", encryption_generation AS "encryptionGeneration",
      nonce, authentication_tag AS "authenticationTag", ciphertext,
      request_commitment AS "requestCommitment"
     FROM sotto.private_attempt_payloads WHERE attempt_id = $1`,
    [source.attemptId],
  );
  const row = result.rows[0];
  if (
    result.rows.length !== 1 ||
    row === undefined ||
    row.schema !== PRIVATE_DELIVERY_REQUEST_SCHEMA ||
    row.algorithm !== PRIVATE_DELIVERY_ALGORITHM ||
    row.requestCommitment !== source.requestCommitment ||
    !Number.isInteger(row.encryptionGeneration)
  ) {
    throw new Error("private delivery request is unavailable");
  }
  return row;
}

export async function assertPrivateDeliveryRequest(
  client: PoolClient,
  source: RequestSource,
  expected: Uint8Array,
  keyring: PrivateDeliveryKeyring,
): Promise<void> {
  const row = await requestRow(client, source);
  const aad = aadInput(source, row.keyId, row.encryptionGeneration);
  const opened = openPrivateDeliveryPayload(
    keyring,
    {
      keyId: row.keyId,
      nonce: row.nonce,
      authenticationTag: row.authenticationTag,
      ciphertext: row.ciphertext,
    },
    buildPrivateDeliveryRequestAad(aad),
  );
  try {
    if (
      opened.byteLength !== expected.byteLength ||
      !timingSafeEqual(opened, expected)
    ) {
      throw new Error("private delivery request does not match");
    }
  } finally {
    opened.fill(0);
  }
}
