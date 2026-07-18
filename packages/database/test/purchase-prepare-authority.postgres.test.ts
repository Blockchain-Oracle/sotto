import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { projectHumanPurchaseJournalIntent } from "@sotto/x402-canton";
import {
  catalogHumanPurchaseIntent,
  PURCHASE_SOURCE_COMMIT,
  purchaseBindingResolver,
} from "./purchase-journal.fixtures.js";
import {
  createPurchaseTestRuntime,
  restorePurchasePrepareAuthorityForTest,
  testPrepareAuthorityKeyring,
} from "./purchase-postgres.fixtures.js";
import { freshHumanPrepareAuthority } from "./purchase-prepare-authority.fixture.js";

let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_purchase_authority_test");
});

afterAll(async () => context?.database.drop());

function repository(marker = 7, sourceCommit = PURCHASE_SOURCE_COMMIT) {
  return context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(
      context.runtime,
      marker,
    ),
    sourceCommit,
    resolveHumanPurchaseBinding: purchaseBindingResolver(),
  });
}

async function storedEnvelope(attemptId: string) {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{
      algorithm: string;
      authorities: string;
      ciphertextBytes: number;
      generation: number;
      keyId: string;
      nonceBytes: number;
      schema: string;
      tagBytes: number;
    }>(
      `SELECT
      count(*) OVER ()::text AS authorities,
      authority_schema AS schema,
      aead_algorithm AS algorithm,
      key_id AS "keyId",
      encryption_generation AS generation,
      octet_length(nonce) AS "nonceBytes",
      octet_length(authentication_tag) AS "tagBytes",
      octet_length(ciphertext) AS "ciphertextBytes"
      FROM sotto.private_prepare_authorities
      WHERE attempt_id = $1`,
      [attemptId],
    );
    return result.rows[0];
  } finally {
    await client.end();
  }
}

async function storedEnvelopeFingerprint(attemptId: string) {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT key_id, encryption_generation,
        encode(nonce, 'hex') AS nonce,
        encode(authentication_tag, 'hex') AS tag,
        encode(ciphertext, 'hex') AS ciphertext,
        created_at
       FROM sotto.private_prepare_authorities WHERE attempt_id = $1`,
      [attemptId],
    );
    return result.rows[0];
  } finally {
    await client.end();
  }
}

describe("durable human prepare authority", () => {
  it("atomically seals one bounded private authority with the journal", async () => {
    const intent = await catalogHumanPurchaseIntent();
    const purchase = repository();
    try {
      const created = await purchase.initializeHumanPurchaseAttempt(intent);
      const envelope = await storedEnvelope(created.attemptId);
      expect(envelope).toEqual({
        algorithm: "aes-256-gcm",
        authorities: "1",
        ciphertextBytes: expect.any(Number),
        generation: 1,
        keyId: "prepare-key-2026-07",
        nonceBytes: 12,
        schema: "sotto-private-prepare-authority-v1",
        tagBytes: 16,
      });
      expect(envelope!.ciphertextBytes).toBeGreaterThan(0);
      expect(envelope!.ciphertextBytes).toBeLessThanOrEqual(196_608);
    } finally {
      await purchase.close();
    }
  });

  it("restores an authenticated intent after a repository restart", async () => {
    const intent = await catalogHumanPurchaseIntent((challenge) => {
      challenge.accepts[0]!.maxTimeoutSeconds = 597;
      challenge.accepts[0]!.extra.executeBeforeSeconds = 597;
    });
    const first = repository();
    const created = await first.initializeHumanPurchaseAttempt(intent);
    await first.close();

    const resolve = vi.fn(async (purchase, scope) => {
      expect(purchase).toMatchObject({
        attemptId: created.attemptId,
        ownerId: created.ownerId,
        resourceRevisionId: created.resourceRevisionId,
        purchaseCommitment: created.purchaseCommitment,
      });
      expect(scope).toMatchObject({
        attemptId: created.attemptId,
        purchaseCommitment: created.purchaseCommitment,
        connector: {
          connectorId: "wallet-sdk-production-test",
          connectorKind: "wallet-sdk",
          origin: "wallet://sotto-production-test",
        },
      });
      return freshHumanPrepareAuthority(intent);
    });
    const restored = await restorePurchasePrepareAuthorityForTest(
      context.database.databaseUrl,
      testPrepareAuthorityKeyring(context.runtime),
      created.attemptId,
      resolve,
    );
    expect(projectHumanPurchaseJournalIntent(restored)).toEqual(
      projectHumanPurchaseJournalIntent(intent),
    );
    expect(() =>
      projectHumanPurchaseJournalIntent(structuredClone(restored) as never),
    ).toThrow(/not authenticated/iu);
    expect(resolve).toHaveBeenCalledOnce();
  });

  it("never overwrites or re-encrypts an idempotent replay", async () => {
    const intent = await catalogHumanPurchaseIntent((challenge) => {
      challenge.accepts[0]!.maxTimeoutSeconds = 596;
      challenge.accepts[0]!.extra.executeBeforeSeconds = 596;
    });
    const first = repository();
    const created = await first.initializeHumanPurchaseAttempt(intent);
    await first.close();
    const before = await storedEnvelopeFingerprint(created.attemptId);

    const deployed = repository(7, "d".repeat(40));
    try {
      await expect(
        deployed.initializeHumanPurchaseAttempt(intent),
      ).resolves.toEqual({ ...created, outcome: "replayed" });
      expect(await storedEnvelopeFingerprint(created.attemptId)).toEqual(
        before,
      );
    } finally {
      await deployed.close();
    }
  });
});
