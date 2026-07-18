import type { Pool, PoolClient } from "pg";
import {
  CatalogConflictError,
  CatalogPersistenceError,
} from "./catalog-types.js";
import {
  PublicationIneligibleError,
  PublicationStaleError,
} from "./publication-types.js";

const CONFLICT_CODES = new Set(["23503", "23505", "23514", "22P02"]);

function databaseCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function publicError(error: unknown): Error {
  if (
    error instanceof CatalogConflictError ||
    error instanceof CatalogPersistenceError ||
    error instanceof PublicationIneligibleError ||
    error instanceof PublicationStaleError
  ) {
    return error;
  }
  return CONFLICT_CODES.has(databaseCode(error) ?? "")
    ? new CatalogConflictError()
    : new CatalogPersistenceError();
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original redacted repository error.
  }
}

export async function publicationTransaction<T>(
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

export async function lockPublicationIdentity(
  client: PoolClient,
  domain: "origin" | "proof" | "publication" | "resource",
  identity: string,
): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `${domain}:${identity}`,
  ]);
}
