import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPurchaseTestRuntime } from "./purchase-postgres.fixtures.js";
import { OWNER_ID, REVISION_ID } from "./publication.fixtures.js";

let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime(
    "sotto_private_prepare_schema_test",
  );
});

afterAll(async () => context?.database.drop());

const attemptId = (marker: string) => `sha256:${marker.repeat(64)}`;

async function insertAttempt(client: Client, marker: string): Promise<string> {
  const id = attemptId(marker);
  await client.query(
    `INSERT INTO sotto.purchase_attempts
      (attempt_id, operation_id, request_hash, owner_id, resource_revision_id,
       authorization_mode, commitment_version, request_commitment, challenge_id,
       purchase_commitment, begin_exclusive, execute_before, source_commit, state)
     VALUES ($1, $2, $3, $4, $5, 'human-wallet',
       'sotto-human-purchase-v1', $6, $7, $8, 0,
       transaction_timestamp() + interval '10 minutes', $9, 'intent-created')`,
    [
      id,
      attemptId(marker === "a" ? "b" : "c"),
      (marker === "a" ? "d" : "e").repeat(64),
      OWNER_ID,
      REVISION_ID,
      attemptId(marker === "a" ? "f" : "1"),
      attemptId(marker === "a" ? "2" : "3"),
      attemptId(marker === "a" ? "4" : "5"),
      (marker === "a" ? "6" : "7").repeat(40),
    ],
  );
  return id;
}

function insertAuthority(
  client: Client,
  id: string,
  overrides: Partial<{
    algorithm: string;
    generation: number;
    keyId: string;
    nonce: Buffer;
    schema: string;
    tag: Buffer;
    ciphertext: Buffer;
  }> = {},
) {
  return client.query(
    `INSERT INTO sotto.private_prepare_authorities
     (attempt_id, authority_schema, aead_algorithm, key_id,
       encryption_generation, nonce, authentication_tag, ciphertext)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      overrides.schema ?? "sotto-private-prepare-authority-v1",
      overrides.algorithm ?? "aes-256-gcm",
      overrides.keyId ?? "prepare-key-2026-07",
      overrides.generation ?? 1,
      overrides.nonce ?? Buffer.alloc(12, 1),
      overrides.tag ?? Buffer.alloc(16, 2),
      overrides.ciphertext ?? Buffer.from([3]),
    ],
  );
}

describe("private prepare authority schema", () => {
  it("contains only the bounded encrypted envelope", async () => {
    const client = new Client({
      connectionString: context.database.databaseUrl,
    });
    await client.connect();
    try {
      const result = await client.query<{ columnName: string }>(
        `SELECT column_name AS "columnName"
         FROM information_schema.columns
         WHERE table_schema = 'sotto'
           AND table_name = 'private_prepare_authorities'
         ORDER BY ordinal_position`,
      );
      expect(result.rows.map(({ columnName }) => columnName)).toEqual([
        "attempt_id",
        "authority_schema",
        "aead_algorithm",
        "key_id",
        "encryption_generation",
        "nonce",
        "authentication_tag",
        "ciphertext",
        "created_at",
      ]);
    } finally {
      await client.end();
    }
  });

  it("enforces nonce uniqueness and every byte/key bound", async () => {
    const client = new Client({
      connectionString: context.database.databaseUrl,
    });
    await client.connect();
    try {
      const first = await insertAttempt(client, "a");
      const second = await insertAttempt(client, "8");
      await insertAuthority(client, first, {
        ciphertext: Buffer.alloc(196_608, 3),
      });
      await expect(insertAuthority(client, second)).rejects.toMatchObject({
        code: "23505",
      });
      await expect(
        insertAuthority(client, second, {
          keyId: "unsafe/key",
          nonce: Buffer.alloc(12, 4),
        }),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        insertAuthority(client, second, {
          nonce: Buffer.alloc(11),
        }),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        insertAuthority(client, second, {
          nonce: Buffer.alloc(12, 5),
          tag: Buffer.alloc(15),
        }),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        insertAuthority(client, second, {
          generation: 0,
          nonce: Buffer.alloc(12, 7),
        }),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        insertAuthority(client, second, {
          schema: "wrong",
          nonce: Buffer.alloc(12, 8),
        }),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        insertAuthority(client, second, {
          algorithm: "wrong",
          nonce: Buffer.alloc(12, 9),
        }),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        insertAuthority(client, second, {
          nonce: Buffer.alloc(12, 10),
          ciphertext: Buffer.alloc(0),
        }),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        insertAuthority(client, second, {
          nonce: Buffer.alloc(12, 6),
          ciphertext: Buffer.alloc(196_609),
        }),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.end();
    }
  });
});
