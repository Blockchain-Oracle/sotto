import { createSecretKey } from "node:crypto";
import { MAX_REQUEST_BODY_BYTES } from "@sotto/x402-canton";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import type {
  PrivateDeliveryKeyring,
  PurchaseRepositoryInput,
} from "../src/index.js";
import {
  catalogHumanPurchaseIntent,
  PURCHASE_SOURCE_COMMIT,
  purchaseBindingResolver,
} from "./purchase-journal.fixtures.js";
import {
  createPurchaseTestRuntime,
  testPrepareAuthorityKeyring,
} from "./purchase-postgres.fixtures.js";

let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_human_delivery_payload");
});

afterAll(async () => context?.database.drop());

function deliveryKeyring(
  marker = 13,
  keyId = "delivery-key-2026-07",
  retained: ReadonlyArray<Readonly<{ id: string; marker: number }>> = [],
): PrivateDeliveryKeyring {
  return context.runtime.createPrivateDeliveryKeyring({
    activeKeyId: keyId,
    keys: [
      { id: keyId, key: createSecretKey(Buffer.alloc(32, marker)) },
      ...retained.map(({ id, marker: retainedMarker }) => ({
        id,
        key: createSecretKey(Buffer.alloc(32, retainedMarker)),
      })),
    ],
  });
}

function repository(privateDeliveryKeyring = deliveryKeyring()) {
  const input = {
    databaseUrl: context.database.databaseUrl,
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(context.runtime),
    privateDeliveryKeyring,
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: purchaseBindingResolver(),
  } satisfies PurchaseRepositoryInput;
  return context.runtime.createPurchaseRepository(input);
}

async function payloadRow(attemptId: string) {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    return (
      await client.query<{
        algorithm: string;
        ciphertext: Buffer;
        generation: number;
        keyId: string;
        nonce: Buffer;
        requestCommitment: string;
        schema: string;
        tag: Buffer;
      }>(
        `SELECT payload_schema AS schema, aead_algorithm AS algorithm,
          key_id AS "keyId", encryption_generation AS generation,
          nonce, authentication_tag AS tag, ciphertext,
          request_commitment AS "requestCommitment"
         FROM sotto.private_attempt_payloads WHERE attempt_id = $1`,
        [attemptId],
      )
    ).rows;
  } finally {
    await client.end();
  }
}

it("atomically stores one immutable encrypted request and replays it", async () => {
  const intent = await catalogHumanPurchaseIntent();
  const first = repository();
  const created = await first.initializeHumanPurchaseAttempt(intent);
  await first.close();
  const original = await payloadRow(created.attemptId);

  expect(original).toEqual([
    {
      algorithm: "aes-256-gcm",
      ciphertext: expect.any(Buffer),
      generation: 1,
      keyId: "delivery-key-2026-07",
      nonce: expect.any(Buffer),
      requestCommitment: created.requestCommitment,
      schema: "sotto-private-delivery-request-v1",
      tag: expect.any(Buffer),
    },
  ]);
  expect(original[0]!.ciphertext.byteLength).toBeGreaterThan(1);

  const restarted = repository();
  try {
    await expect(
      restarted.initializeHumanPurchaseAttempt(intent),
    ).resolves.toMatchObject({
      outcome: "replayed",
      attemptId: created.attemptId,
    });
    expect(await payloadRow(created.attemptId)).toEqual(original);
  } finally {
    await restarted.close();
  }
});

it("persists the exact maximum request body below the database bound", async () => {
  const intent = await catalogHumanPurchaseIntent(() => undefined, {
    body: new Uint8Array(MAX_REQUEST_BODY_BYTES).fill(0x5a),
    method: "GET",
    url: "https://weather.example.com/weather/current",
  });
  const purchase = repository();
  try {
    const created = await purchase.initializeHumanPurchaseAttempt(intent);
    const stored = await payloadRow(created.attemptId);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.ciphertext.byteLength).toBeGreaterThan(
      MAX_REQUEST_BODY_BYTES,
    );
    expect(stored[0]!.ciphertext.byteLength).toBeLessThanOrEqual(1_200_000);
  } finally {
    await purchase.close();
  }
});

it("fails closed when replay cannot authenticate the delivery key", async () => {
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = 599;
    challenge.accepts[0]!.extra.executeBeforeSeconds = 599;
  });
  const first = repository(deliveryKeyring(17, "delivery-key-retired"));
  await first.initializeHumanPurchaseAttempt(intent);
  await first.close();

  const restarted = repository(deliveryKeyring(19, "delivery-key-current"));
  try {
    await expect(
      restarted.initializeHumanPurchaseAttempt(intent),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
  } finally {
    await restarted.close();
  }
});

it("rolls back every row when encrypted request persistence fails", async () => {
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = 598;
    challenge.accepts[0]!.extra.executeBeforeSeconds = 598;
  });
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE FUNCTION sotto.reject_test_delivery_payload()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.attempt_id = '${intent.attemptId}' THEN
          RAISE EXCEPTION 'private request secret' USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END $$`);
    await client.query(`CREATE TRIGGER reject_test_delivery_payload
      BEFORE INSERT ON sotto.private_attempt_payloads FOR EACH ROW
      EXECUTE FUNCTION sotto.reject_test_delivery_payload()`);
  } finally {
    await client.end();
  }
  const purchase = repository();
  try {
    await expect(
      purchase.initializeHumanPurchaseAttempt(intent),
    ).rejects.toMatchObject({
      code: "PURCHASE_PERSISTENCE",
      message: "purchase persistence failed",
    });
    const inspector = new Client({
      connectionString: context.database.databaseUrl,
    });
    await inspector.connect();
    try {
      const rows = await inspector.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM (
          SELECT attempt_id FROM sotto.purchase_attempts WHERE attempt_id = $1
          UNION ALL SELECT attempt_id FROM sotto.private_prepare_authorities
            WHERE attempt_id = $1
          UNION ALL SELECT attempt_id FROM sotto.private_attempt_payloads
            WHERE attempt_id = $1
          UNION ALL SELECT attempt_id FROM sotto.attempt_events
            WHERE attempt_id = $1
          UNION ALL SELECT attempt_id FROM sotto.outbox_jobs
            WHERE attempt_id = $1
        ) records`,
        [intent.attemptId],
      );
      expect(rows.rows).toEqual([{ count: "0" }]);
    } finally {
      await inspector.end();
    }
  } finally {
    await purchase.close();
  }
});
