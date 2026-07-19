import { randomUUID } from "node:crypto";
import { MIN_HUMAN_SIGNING_RESERVE_MS } from "@sotto/x402-canton/internal/human-prepare-authority-persistence";
import type { Pool, PoolClient } from "pg";
import type { PrepareAuthorityKeyring } from "./private-prepare-authority-types.js";
import type { PrivateDeliveryKeyring } from "./private-delivery-types.js";
import {
  assertInitialDeliveryRequest,
  assertInitialPrepareAuthority,
  insertInitialPrivateMaterial,
} from "./purchase-initialize-private.js";
import { findPurchaseAggregate } from "./purchase-query.js";
import { purchaseAggregateResult } from "./purchase-query-result.js";
import {
  lockPurchaseOperation,
  purchaseTransaction,
} from "./purchase-transaction.js";
import {
  PurchaseConflictError,
  type HumanPurchaseAttemptResult,
} from "./purchase-types.js";
import type { ValidatedHumanPurchaseAttempt } from "./purchase-validation.js";
import { readStoredSettlementAuthority } from "./purchase-settlement-row.js";

const PURCHASE_COMMIT_HEADROOM_MS = 15_000;

async function requirePrepareSigningReserve(
  client: PoolClient,
  executeBefore: string,
): Promise<void> {
  const result = await client.query<{ sufficient: boolean }>(
    `SELECT $1::timestamptz - clock_timestamp() >=
      ($2::bigint * interval '1 millisecond') AS sufficient`,
    [executeBefore, MIN_HUMAN_SIGNING_RESERVE_MS + PURCHASE_COMMIT_HEADROOM_MS],
  );
  if (result.rows.length !== 1 || result.rows[0]?.sufficient !== true) {
    throw new Error("purchase prepare signing reserve is exhausted");
  }
}

async function insertAttempt(
  client: PoolClient,
  attempt: ValidatedHumanPurchaseAttempt,
): Promise<void> {
  await client.query(
    `INSERT INTO sotto.purchase_attempts
      (attempt_id, operation_id, request_hash, owner_id, resource_revision_id,
       authorization_mode, commitment_version, request_commitment, challenge_id,
       purchase_commitment, begin_exclusive, execute_before, source_commit, state)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
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
    ],
  );
}

async function insertInitialEvent(
  client: PoolClient,
  attempt: ValidatedHumanPurchaseAttempt,
): Promise<void> {
  await client.query(
    `INSERT INTO sotto.attempt_events
      (attempt_id, sequence, event_type, event_hash, previous_event_hash)
     VALUES ($1, $2, $3, $4, NULL)`,
    [
      attempt.attemptId,
      attempt.eventSequence,
      attempt.eventType,
      attempt.eventHash,
    ],
  );
}

async function insertInitialJob(
  client: PoolClient,
  attempt: ValidatedHumanPurchaseAttempt,
): Promise<void> {
  await client.query(
    `INSERT INTO sotto.outbox_jobs
      (job_id, dedupe_key, attempt_id, event_sequence, kind, state)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      randomUUID(),
      attempt.jobDedupeKey,
      attempt.attemptId,
      attempt.eventSequence,
      attempt.jobKind,
      attempt.jobState,
    ],
  );
}

async function requireResource(
  client: PoolClient,
  attempt: ValidatedHumanPurchaseAttempt,
): Promise<void> {
  const resource = await client.query<{
    method: string;
    origin: string;
    path: string;
  }>(
    `SELECT revision.http_method AS method,
      origin.normalized_origin AS origin,
      revision.route_template AS path
     FROM sotto.resource_revisions revision
     JOIN sotto.origins origin ON origin.id = revision.origin_id
     WHERE revision.revision_id = $1`,
    [attempt.resourceRevisionId],
  );
  if (
    resource.rows.length !== 1 ||
    JSON.stringify(resource.rows[0]) !== JSON.stringify(attempt.resource)
  ) {
    throw new PurchaseConflictError();
  }
}

export async function initializePurchaseAttempt(
  pool: Pool,
  attempt: ValidatedHumanPurchaseAttempt,
  plaintext: Uint8Array,
  keyring: PrepareAuthorityKeyring,
  deliveryPlaintext: Uint8Array,
  deliveryKeyring: PrivateDeliveryKeyring,
): Promise<HumanPurchaseAttemptResult> {
  return purchaseTransaction(pool, async (client) => {
    await lockPurchaseOperation(client, attempt.operationId);
    await requireResource(client, attempt);
    const existing = await findPurchaseAggregate(client, attempt.operationId);
    if (existing !== undefined) {
      const settlement =
        existing.state === "prepared-hash-verified"
          ? await readStoredSettlementAuthority(client, existing.attemptId)
          : null;
      const replay = purchaseAggregateResult(
        existing,
        attempt,
        "replayed",
        settlement,
      );
      await assertInitialDeliveryRequest(
        client,
        existing,
        deliveryPlaintext,
        deliveryKeyring,
      );
      if (replay.state === "intent-created") {
        await requirePrepareSigningReserve(client, attempt.executeBefore);
        await assertInitialPrepareAuthority(
          client,
          existing,
          plaintext,
          keyring,
        );
        await requirePrepareSigningReserve(client, attempt.executeBefore);
      }
      return replay;
    }
    await requirePrepareSigningReserve(client, attempt.executeBefore);
    await insertAttempt(client, attempt);
    await insertInitialPrivateMaterial(
      client,
      attempt,
      plaintext,
      keyring,
      deliveryPlaintext,
      deliveryKeyring,
    );
    await insertInitialEvent(client, attempt);
    await insertInitialJob(client, attempt);
    const created = await findPurchaseAggregate(client, attempt.operationId);
    if (created === undefined) throw new Error("purchase aggregate is absent");
    await assertInitialPrepareAuthority(client, created, plaintext, keyring);
    await requirePrepareSigningReserve(client, attempt.executeBefore);
    return purchaseAggregateResult(created, attempt, "created");
  });
}
