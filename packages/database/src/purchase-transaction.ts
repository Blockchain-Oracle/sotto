import type { Pool, PoolClient } from "pg";
import {
  PurchaseConflictError,
  PurchasePersistenceError,
} from "./purchase-types.js";

const CONFLICT_CODES = new Set(["23503", "23505", "23514", "22P02"]);

function databaseCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function databaseConstraint(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "constraint" in error
    ? String(error.constraint)
    : undefined;
}

function publicError(error: unknown): Error {
  if (
    error instanceof PurchaseConflictError ||
    error instanceof PurchasePersistenceError
  ) {
    return error;
  }
  const constraint = databaseConstraint(error);
  if (
    constraint?.startsWith("private_prepare_authorities_") === true ||
    constraint?.startsWith("private_attempt_payloads_") === true ||
    constraint === "outbox_jobs_prepare_authority_fk"
  ) {
    return new PurchasePersistenceError();
  }
  return CONFLICT_CODES.has(databaseCode(error) ?? "")
    ? new PurchaseConflictError()
    : new PurchasePersistenceError();
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original redacted repository error.
  }
}

export async function purchaseTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  let client: PoolClient | undefined;
  let started = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    started = true;
    const result = await work(client);
    await client.query("COMMIT");
    started = false;
    return result;
  } catch (error) {
    if (client !== undefined && started) await rollback(client);
    throw publicError(error);
  } finally {
    client?.release();
  }
}

export async function lockPurchaseOperation(
  client: PoolClient,
  operationId: string,
): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `purchase:${operationId}`,
  ]);
}
