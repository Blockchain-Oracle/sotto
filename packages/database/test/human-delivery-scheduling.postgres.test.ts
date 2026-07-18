import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createPurchaseTestRuntime } from "./purchase-postgres.fixtures.js";
import {
  claimTerminalAttempt,
  rejectedCheckpoint,
  succeededCheckpoint,
  TERMINAL_UPDATE_A,
} from "./human-reconciliation-fence.postgres.fixture.js";
import type { ReconciliationTestContext } from "./human-reconciliation.postgres.fixture.js";

let context: ReconciliationTestContext;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_delivery_scheduling");
});

afterAll(async () => context?.database.drop());

async function insertPrivatePayload(
  attemptId: string,
  requestCommitment: string,
): Promise<void> {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO sotto.private_attempt_payloads
        (attempt_id, request_commitment, payload_schema, aead_algorithm,
         key_id, encryption_generation, nonce, authentication_tag, ciphertext)
       VALUES ($1, $2, 'sotto-private-delivery-request-v1', 'aes-256-gcm',
         'delivery-key-2026-07', 1, $3, $4, $5)`,
      [
        attemptId,
        requestCommitment,
        Buffer.from(attemptId.slice(7, 31), "hex"),
        Buffer.alloc(16, 8),
        Buffer.from("{}"),
      ],
    );
  } finally {
    await client.end();
  }
}

async function deliveryRows(attemptId: string) {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    return (
      await client.query<{
        attemptId: string;
        requestCommitment: string;
        state: string;
        updateId: string;
      }>(
        `SELECT attempt_id AS "attemptId", request_commitment AS "requestCommitment",
          state, update_id AS "updateId"
         FROM sotto.delivery_claims WHERE attempt_id = $1`,
        [attemptId],
      )
    ).rows;
  } finally {
    await client.end();
  }
}

it("atomically schedules one exact delivery after successful settlement", async () => {
  const attempt = await claimTerminalAttempt(context, 568, "delivery-success");
  try {
    await insertPrivatePayload(
      attempt.initialized.attemptId,
      attempt.initialized.requestCommitment,
    );
    await attempt.terminal.completeHumanReconciliation(
      succeededCheckpoint(attempt.claim),
    );

    expect(await deliveryRows(attempt.initialized.attemptId)).toEqual([
      {
        attemptId: attempt.initialized.attemptId,
        requestCommitment: attempt.initialized.requestCommitment,
        state: "ready",
        updateId: TERMINAL_UPDATE_A,
      },
    ]);
    const client = new Client({
      connectionString: context.database.databaseUrl,
    });
    await client.connect();
    try {
      await expect(
        client.query(
          `UPDATE sotto.delivery_claims SET state = 'dispatching'
           WHERE attempt_id = $1`,
          [attempt.initialized.attemptId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.end();
    }
  } finally {
    await attempt.purchase.close();
  }
});

it("never schedules delivery after rejected settlement", async () => {
  const attempt = await claimTerminalAttempt(context, 567, "delivery-rejected");
  try {
    await insertPrivatePayload(
      attempt.initialized.attemptId,
      attempt.initialized.requestCommitment,
    );
    await attempt.terminal.completeHumanReconciliation(
      rejectedCheckpoint(attempt.claim),
    );

    expect(await deliveryRows(attempt.initialized.attemptId)).toEqual([]);
  } finally {
    await attempt.purchase.close();
  }
});
