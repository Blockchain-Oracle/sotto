import { timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import {
  openPrepareAuthority,
  sealPrepareAuthority,
} from "./private-prepare-authority-crypto.js";
import { readPrivatePrepareAuthorityActiveKeyId } from "./private-prepare-authority-keyring.js";
import {
  PRIVATE_PREPARE_AUTHORITY_ALGORITHM,
  type PrepareAuthorityEnvelope,
  type PrepareAuthorityKeyring,
} from "./private-prepare-authority-types.js";
import {
  buildPrivatePrepareAuthorityAad,
  PRIVATE_PREPARE_AUTHORITY_SCHEMA,
  type PrivatePrepareAuthorityAadInput,
} from "./purchase-prepare-authority-aad.js";

type AuthorityRow = Readonly<{
  authoritySchema: string;
  aeadAlgorithm: string;
  keyId: string;
  encryptionGeneration: number;
  nonce: Buffer;
  authenticationTag: Buffer;
  ciphertext: Buffer;
}>;

type SealedAuthority = Readonly<{
  aad: PrivatePrepareAuthorityAadInput;
  envelope: PrepareAuthorityEnvelope;
}>;

function aadInput(
  source: Omit<
    PrivatePrepareAuthorityAadInput,
    "keyId" | "encryptionGeneration"
  >,
  keyId: string,
  encryptionGeneration = 1,
): PrivatePrepareAuthorityAadInput {
  return {
    attemptId: source.attemptId,
    encryptionGeneration,
    keyId,
    operationId: source.operationId,
    ownerId: source.ownerId,
    purchaseCommitment: source.purchaseCommitment,
    requestHash: source.requestHash,
    resourceRevisionId: source.resourceRevisionId,
    sourceCommit: source.sourceCommit,
  };
}

export function sealPurchasePrepareAuthority(
  source: Omit<
    PrivatePrepareAuthorityAadInput,
    "keyId" | "encryptionGeneration"
  >,
  plaintext: Uint8Array,
  keyring: PrepareAuthorityKeyring,
): SealedAuthority {
  const aad = aadInput(source, readPrivatePrepareAuthorityActiveKeyId(keyring));
  return Object.freeze({
    aad,
    envelope: sealPrepareAuthority(
      keyring,
      plaintext,
      buildPrivatePrepareAuthorityAad(aad),
    ),
  });
}

export async function insertPurchasePrepareAuthority(
  client: PoolClient,
  attemptId: string,
  sealed: SealedAuthority,
): Promise<void> {
  await client.query(
    `INSERT INTO sotto.private_prepare_authorities
      (attempt_id, authority_schema, aead_algorithm, key_id,
       encryption_generation, nonce, authentication_tag, ciphertext)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      attemptId,
      PRIVATE_PREPARE_AUTHORITY_SCHEMA,
      PRIVATE_PREPARE_AUTHORITY_ALGORITHM,
      sealed.envelope.keyId,
      sealed.aad.encryptionGeneration,
      sealed.envelope.nonce,
      sealed.envelope.authenticationTag,
      sealed.envelope.ciphertext,
    ],
  );
}

async function authorityRow(
  client: PoolClient,
  attemptId: string,
): Promise<AuthorityRow> {
  const result = await client.query<AuthorityRow>(
    `SELECT
      authority_schema AS "authoritySchema",
      aead_algorithm AS "aeadAlgorithm",
      key_id AS "keyId",
      encryption_generation AS "encryptionGeneration",
      nonce,
      authentication_tag AS "authenticationTag",
      ciphertext
     FROM sotto.private_prepare_authorities
     WHERE attempt_id = $1 AND retired_at IS NULL`,
    [attemptId],
  );
  const row = result.rows[0];
  if (
    result.rows.length !== 1 ||
    row === undefined ||
    row.authoritySchema !== PRIVATE_PREPARE_AUTHORITY_SCHEMA ||
    row.aeadAlgorithm !== PRIVATE_PREPARE_AUTHORITY_ALGORITHM ||
    !Number.isInteger(row.encryptionGeneration)
  ) {
    throw new Error("private prepare authority is unavailable");
  }
  return row;
}

export async function openPurchasePrepareAuthority(
  client: PoolClient,
  source: Omit<
    PrivatePrepareAuthorityAadInput,
    "keyId" | "encryptionGeneration"
  >,
  keyring: PrepareAuthorityKeyring,
): Promise<Uint8Array> {
  const row = await authorityRow(client, source.attemptId);
  const aad = aadInput(source, row.keyId, row.encryptionGeneration);
  return openPrepareAuthority(
    keyring,
    {
      keyId: row.keyId,
      nonce: row.nonce,
      authenticationTag: row.authenticationTag,
      ciphertext: row.ciphertext,
    },
    buildPrivatePrepareAuthorityAad(aad),
  );
}

export async function assertPurchasePrepareAuthority(
  client: PoolClient,
  source: Omit<
    PrivatePrepareAuthorityAadInput,
    "keyId" | "encryptionGeneration"
  >,
  expected: Uint8Array,
  keyring: PrepareAuthorityKeyring,
): Promise<void> {
  const opened = await openPurchasePrepareAuthority(client, source, keyring);
  try {
    if (
      opened.byteLength !== expected.byteLength ||
      !timingSafeEqual(opened, expected)
    ) {
      throw new Error("private prepare authority does not match");
    }
  } finally {
    opened.fill(0);
  }
}
