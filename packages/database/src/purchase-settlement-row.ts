import { createHash } from "node:crypto";
import {
  exportHumanSettlementExpectation,
  restoreHumanSettlementExpectation,
} from "@sotto/x402-canton/internal/human-settlement-expectation-journal";
import type { HumanSettlementExpectation } from "@sotto/x402-canton";
import type { Pool, PoolClient } from "pg";
import { settlementPreparedEventHash } from "./purchase-prepare-event.js";
import { PurchasePersistenceError } from "./purchase-types.js";

type Queryable = Pool | PoolClient;

type SettlementRow = Readonly<{
  attemptId: string;
  attemptCommandId: string;
  requestHash: string;
  requestCommitment: string;
  challengeId: string;
  purchaseCommitment: string;
  attemptPreparedHash: string;
  attemptContextHash: string;
  attemptVerifiedAt: Date;
  initialSequence: string;
  initialType: string;
  initialHash: string;
  initialPreviousHash: string | null;
  preparedSequence: string;
  preparedType: string;
  preparedHash: string;
  preparedPreviousHash: string;
  eventPreparedHash: string;
  eventContextHash: string;
  eventVerifiedAt: Date;
  settlementAttemptId: string;
  settlementCommandId: string;
  expectationSchema: string;
  expectationJson: string;
  expectationDigest: string;
}>;

export type StoredSettlementAuthority = Readonly<{
  commandId: string;
  digest: string;
  eventHash: string;
  expectation: HumanSettlementExpectation;
  schema: string;
}>;

function initialEventHash(requestHash: string): string {
  return `sha256:${createHash("sha256")
    .update(`sotto-purchase-intent-event-v1\0${requestHash}`, "utf8")
    .digest("hex")}`;
}

function canonicalTime(value: unknown): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new PurchasePersistenceError();
  }
  return value.toISOString();
}

function validateStoredSettlement(
  row: SettlementRow,
): StoredSettlementAuthority {
  const initialHash = initialEventHash(row.requestHash);
  const verifiedAt = canonicalTime(row.attemptVerifiedAt);
  if (
    row.initialSequence !== "1" ||
    row.initialType !== "intent-created" ||
    row.initialHash !== initialHash ||
    row.initialPreviousHash !== null ||
    row.preparedSequence !== "2" ||
    row.preparedType !== "prepared-hash-verified" ||
    row.preparedPreviousHash !== initialHash ||
    row.attemptPreparedHash !== row.eventPreparedHash ||
    row.attemptContextHash !== row.eventContextHash ||
    canonicalTime(row.eventVerifiedAt) !== verifiedAt ||
    row.settlementAttemptId !== row.attemptId ||
    row.settlementCommandId !== row.attemptCommandId
  ) {
    throw new PurchasePersistenceError();
  }
  let expectation: HumanSettlementExpectation;
  try {
    expectation = restoreHumanSettlementExpectation(
      JSON.parse(row.expectationJson) as unknown,
    );
    const exported = exportHumanSettlementExpectation(expectation);
    if (
      exported.schema !== row.expectationSchema ||
      exported.authorityDigest !== row.expectationDigest ||
      JSON.stringify(exported) !== row.expectationJson ||
      exported.expectation.attemptId !== row.attemptId ||
      exported.expectation.commandId !== row.attemptCommandId ||
      exported.expectation.requestCommitment !== row.requestCommitment ||
      exported.expectation.challengeId !== row.challengeId ||
      exported.expectation.purchaseCommitment !== row.purchaseCommitment
    ) {
      throw new PurchasePersistenceError();
    }
  } catch {
    throw new PurchasePersistenceError();
  }
  const eventHash = settlementPreparedEventHash({
    attemptId: row.attemptId,
    preparedTransactionHash: row.attemptPreparedHash,
    transferContextHash: row.attemptContextHash,
    verifiedAt,
    expectationSchema: row.expectationSchema,
    expectationDigest: row.expectationDigest,
    previousEventHash: initialHash,
  });
  if (row.preparedHash !== eventHash) throw new PurchasePersistenceError();
  return Object.freeze({
    commandId: row.settlementCommandId,
    digest: row.expectationDigest,
    eventHash,
    expectation,
    schema: row.expectationSchema,
  });
}

export async function readStoredSettlementAuthority(
  source: Queryable,
  attemptId: string,
): Promise<StoredSettlementAuthority | null> {
  const table = await source.query<{ present: string | null }>(
    `SELECT to_regclass('sotto.settlements')::text AS present`,
  );
  if (table.rows[0]?.present === null) return null;
  const result = await source.query<SettlementRow>(
    `SELECT attempt.attempt_id AS "attemptId",
      attempt.command_id AS "attemptCommandId", attempt.request_hash AS "requestHash",
      attempt.request_commitment AS "requestCommitment",
      attempt.challenge_id AS "challengeId",
      attempt.purchase_commitment AS "purchaseCommitment",
      attempt.prepared_transaction_hash AS "attemptPreparedHash",
      attempt.transfer_context_hash AS "attemptContextHash",
      attempt.prepared_verified_at AS "attemptVerifiedAt",
      initial.sequence::text AS "initialSequence", initial.event_type AS "initialType",
      initial.event_hash AS "initialHash",
      initial.previous_event_hash AS "initialPreviousHash",
      prepared.sequence::text AS "preparedSequence",
      prepared.event_type AS "preparedType", prepared.event_hash AS "preparedHash",
      prepared.previous_event_hash AS "preparedPreviousHash",
      prepared.prepared_transaction_hash AS "eventPreparedHash",
      prepared.transfer_context_hash AS "eventContextHash",
      prepared.prepared_verified_at AS "eventVerifiedAt",
      settlement.attempt_id AS "settlementAttemptId",
      settlement.command_id AS "settlementCommandId",
      settlement.expectation_schema AS "expectationSchema",
      settlement.expectation AS "expectationJson",
      settlement.expectation_digest AS "expectationDigest"
     FROM sotto.settlements settlement
     JOIN sotto.purchase_attempts attempt
       ON attempt.attempt_id = settlement.attempt_id
     JOIN sotto.attempt_events initial
       ON initial.attempt_id = attempt.attempt_id AND initial.sequence = 1
     JOIN sotto.attempt_events prepared
       ON prepared.attempt_id = attempt.attempt_id AND prepared.sequence = 2
     WHERE settlement.attempt_id = $1`,
    [attemptId],
  );
  if (result.rows.length === 0) return null;
  if (result.rows.length !== 1) throw new PurchasePersistenceError();
  return validateStoredSettlement(result.rows[0]!);
}
