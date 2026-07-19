import { createSecretKey, randomUUID } from "node:crypto";
import type { HumanPurchaseLedgerIntent } from "@sotto/x402-canton";
import { projectHumanPurchaseJournalIntent } from "@sotto/x402-canton";
import { exportHumanPrepareAuthorityPlaintext } from "@sotto/x402-canton/internal/human-prepare-authority-persistence";
import { Pool, type PoolClient } from "pg";
import { findPurchaseAggregate } from "../src/purchase-query.js";
import { purchaseAggregateResult } from "../src/purchase-query-result.js";
import {
  insertPurchasePrepareAuthority,
  sealPurchasePrepareAuthority,
} from "../src/purchase-prepare-authority-store.js";
import { createPrepareAuthorityKeyring } from "../src/private-prepare-authority-keyring.js";
import type { HumanPurchaseAttemptResult } from "../src/purchase-types.js";
import { validateHumanPurchaseAttemptInitialization } from "../src/purchase-validation.js";
import {
  humanPurchaseBinding,
  PURCHASE_SOURCE_COMMIT,
} from "./purchase-journal.fixtures.js";

function values(
  attempt: ReturnType<typeof validateHumanPurchaseAttemptInitialization>,
) {
  return [
    attempt.attemptId,
    attempt.operationId,
    attempt.requestHash,
    attempt.ownerId,
    attempt.resourceRevisionId,
    attempt.authorizationMode,
    attempt.commitmentVersion,
    attempt.requestCommitment,
    attempt.challengeId,
    attempt.purchaseCommitment,
    attempt.beginExclusive,
    attempt.executeBefore,
    attempt.sourceCommit,
    attempt.state,
  ];
}

export async function seedLegacyHumanPurchase(
  databaseUrl: string,
  intent: HumanPurchaseLedgerIntent,
): Promise<void> {
  const attempt = validateHumanPurchaseAttemptInitialization(
    projectHumanPurchaseJournalIntent(intent),
    humanPurchaseBinding,
    PURCHASE_SOURCE_COMMIT,
  );
  const plaintext = exportHumanPrepareAuthorityPlaintext(intent);
  const keyring = createPrepareAuthorityKeyring({
    activeKeyId: "prepare-key-2026-07",
    keys: [
      {
        id: "prepare-key-2026-07",
        key: createSecretKey(Buffer.alloc(32, 7)),
      },
    ],
  });
  const sealed = sealPurchasePrepareAuthority(attempt, plaintext, keyring);
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO sotto.purchase_attempts
        (attempt_id, operation_id, request_hash, owner_id,
         resource_revision_id, authorization_mode, commitment_version,
         request_commitment, challenge_id, purchase_commitment,
         begin_exclusive, execute_before, source_commit, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      values(attempt),
    );
    await insertPurchasePrepareAuthority(client, attempt.attemptId, sealed);
    await client.query(
      `INSERT INTO sotto.attempt_events
        (attempt_id, sequence, event_type, event_hash, previous_event_hash)
       VALUES ($1, 1, 'intent-created', $2, NULL)`,
      [attempt.attemptId, attempt.eventHash],
    );
    await client.query(
      `INSERT INTO sotto.outbox_jobs
        (job_id, dedupe_key, attempt_id, event_sequence, kind, state)
       VALUES ($1, $2, $3, 1, 'purchase-prepare', 'ready')`,
      [randomUUID(), attempt.jobDedupeKey, attempt.attemptId],
    );
    await client.query("COMMIT");
  } catch (error) {
    if (client !== undefined) await client.query("ROLLBACK");
    throw error;
  } finally {
    plaintext.fill(0);
    client?.release();
    await pool.end();
  }
}

export async function readLegacyHumanPurchase(
  databaseUrl: string,
  intent: HumanPurchaseLedgerIntent,
): Promise<HumanPurchaseAttemptResult> {
  const attempt = validateHumanPurchaseAttemptInitialization(
    projectHumanPurchaseJournalIntent(intent),
    humanPurchaseBinding,
    PURCHASE_SOURCE_COMMIT,
  );
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const client = await pool.connect();
    try {
      const row = await findPurchaseAggregate(client, attempt.operationId);
      if (row === undefined) throw new Error("legacy purchase is absent");
      return purchaseAggregateResult(row, attempt, "replayed");
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
