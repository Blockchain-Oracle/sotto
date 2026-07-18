import { randomUUID } from "node:crypto";
import {
  projectHumanPurchaseJournalIntent,
  type HumanPurchaseLedgerIntent,
} from "@sotto/x402-canton";
import type { Pool, PoolClient } from "pg";
import { createPurchasePoolRuntime } from "./purchase-pool.js";
import {
  findPurchaseAggregate,
  purchaseAggregateResult,
} from "./purchase-query.js";
import {
  lockPurchaseOperation,
  purchaseTransaction,
} from "./purchase-transaction.js";
import {
  PurchaseConflictError,
  PurchasePersistenceError,
  type HumanPurchaseAttemptResult,
  type PurchaseRepository,
  type PurchaseRepositoryInput,
} from "./purchase-types.js";
import {
  validateHumanPurchaseAttemptInitialization,
  validatePurchaseSourceCommit,
  type ValidatedHumanPurchaseAttempt,
} from "./purchase-validation.js";

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

async function initializeAttempt(
  pool: Pool,
  attempt: ValidatedHumanPurchaseAttempt,
): Promise<HumanPurchaseAttemptResult> {
  return purchaseTransaction(pool, async (client) => {
    await lockPurchaseOperation(client, attempt.operationId);
    const resource = await client.query<{
      method: string;
      origin: string;
      path: string;
    }>(
      `SELECT
        revision.http_method AS method,
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
    const existing = await findPurchaseAggregate(client, attempt.operationId);
    if (existing !== undefined) {
      return purchaseAggregateResult(existing, attempt, "replayed");
    }
    await insertAttempt(client, attempt);
    await insertInitialEvent(client, attempt);
    await insertInitialJob(client, attempt);
    const created = await findPurchaseAggregate(client, attempt.operationId);
    if (created === undefined) throw new Error("purchase aggregate is absent");
    return purchaseAggregateResult(created, attempt, "created");
  });
}

export function createPurchaseRepository(
  input: PurchaseRepositoryInput,
): PurchaseRepository {
  if (typeof input.resolveHumanPurchaseBinding !== "function") {
    throw new Error("purchase binding resolver is required");
  }
  const sourceCommit = validatePurchaseSourceCommit(input.sourceCommit);
  const runtime = createPurchasePoolRuntime(input);
  const initializeHumanPurchaseAttempt = async (
    candidate: HumanPurchaseLedgerIntent,
  ) => {
    const release = runtime.admit();
    try {
      const intent = projectHumanPurchaseJournalIntent(candidate);
      let binding: Awaited<
        ReturnType<typeof input.resolveHumanPurchaseBinding>
      >;
      try {
        binding = await input.resolveHumanPurchaseBinding(intent);
      } catch {
        throw new PurchasePersistenceError();
      }
      const current = projectHumanPurchaseJournalIntent(candidate);
      if (JSON.stringify(current) !== JSON.stringify(intent)) {
        throw new PurchasePersistenceError();
      }
      const attempt = validateHumanPurchaseAttemptInitialization(
        current,
        binding,
        sourceCommit,
      );
      return await initializeAttempt(runtime.pool, attempt);
    } finally {
      release();
    }
  };
  return Object.freeze({
    initializeHumanPurchaseAttempt,
    close: runtime.close,
  });
}
