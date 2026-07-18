import type { Pool, PoolClient } from "pg";
import {
  CatalogConflictError,
  CatalogPersistenceError,
  type CatalogRepository,
  type CatalogRepositoryInput,
  type ProviderOriginRecord,
  type ProviderOriginRegistration,
  type ProviderOriginRegistrationResult,
} from "./catalog-types.js";
import {
  CATALOG_SELECT,
  registrationResult,
  type CatalogRow,
} from "./catalog-rows.js";
import {
  normalizeCatalogOrigin,
  validateCatalogId,
  validateProviderOriginRegistration,
  type ValidatedProviderOrigin,
} from "./catalog-validation.js";
import { createCatalogPoolRuntime } from "./catalog-pool.js";
import {
  findProviderOriginRecord,
  findProviderOriginRecordById,
} from "./catalog-query.js";
import { createPublicationMethods } from "./publication.js";

async function rowByRegistration(
  client: PoolClient,
  registrationId: string,
): Promise<CatalogRow | undefined> {
  const result = await client.query<CatalogRow>(
    `${CATALOG_SELECT} WHERE registration.registration_id = $1`,
    [registrationId],
  );
  return result.rows[0];
}

async function insertRegistration(
  client: PoolClient,
  input: ValidatedProviderOrigin,
): Promise<void> {
  await client.query(
    `INSERT INTO sotto.owners (id, party_id) VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING`,
    [input.ownerId, input.ownerPartyId],
  );
  await client.query(
    `INSERT INTO sotto.providers (id, owner_id, display_name) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [input.providerId, input.ownerId, input.providerDisplayName],
  );
  await client.query(
    `INSERT INTO sotto.origins (id, provider_id, hostname, port)
     VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
    [input.originId, input.providerId, input.hostname, input.port],
  );
  await client.query(
    `INSERT INTO sotto.catalog_registrations
      (registration_id, request_hash, origin_id)
     VALUES ($1, $2, $3)`,
    [input.registrationId, input.requestHash, input.originId],
  );
}

function isExpectedConflict(error: unknown): boolean {
  if (error instanceof CatalogConflictError) return true;
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  return new Set(["23503", "23505", "23514", "22P02"]).has(
    error.code as string,
  );
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The caller still receives a redacted persistence error.
  }
}

async function persistRegistration(
  pool: Pool,
  validated: ValidatedProviderOrigin,
): Promise<ProviderOriginRegistrationResult> {
  let client: PoolClient | undefined;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [validated.registrationId],
    );
    const existing = await rowByRegistration(client, validated.registrationId);
    if (existing !== undefined) {
      const replay = registrationResult(existing, validated, "replayed");
      await client.query("COMMIT");
      transactionStarted = false;
      return replay;
    }
    await insertRegistration(client, validated);
    const created = await rowByRegistration(client, validated.registrationId);
    if (created === undefined) throw new CatalogPersistenceError();
    const result = registrationResult(created, validated, "created");
    await client.query("COMMIT");
    transactionStarted = false;
    return result;
  } catch (error) {
    if (client !== undefined && transactionStarted) await rollback(client);
    if (isExpectedConflict(error)) throw new CatalogConflictError();
    if (error instanceof CatalogPersistenceError) throw error;
    throw new CatalogPersistenceError();
  } finally {
    client?.release();
  }
}

export function createCatalogRepository(
  input: CatalogRepositoryInput,
): CatalogRepository {
  const runtime = createCatalogPoolRuntime(input);
  const publication = createPublicationMethods(runtime);

  const registerProviderOrigin = async (
    candidate: ProviderOriginRegistration,
  ): Promise<ProviderOriginRegistrationResult> => {
    const release = runtime.admit();
    try {
      const validated = validateProviderOriginRegistration(candidate);
      return await persistRegistration(runtime.pool, validated);
    } finally {
      release();
    }
  };

  const findProviderOrigin = async (
    originUrl: string,
  ): Promise<ProviderOriginRecord | null> => {
    const release = runtime.admit();
    try {
      const { normalizedOrigin } = normalizeCatalogOrigin(originUrl);
      return await findProviderOriginRecord(runtime.pool, normalizedOrigin);
    } finally {
      release();
    }
  };

  const findProviderOriginById = async (
    originId: string,
  ): Promise<ProviderOriginRecord | null> => {
    const release = runtime.admit();
    try {
      return await findProviderOriginRecordById(
        runtime.pool,
        validateCatalogId(originId, "catalog origin ID"),
      );
    } finally {
      release();
    }
  };

  return Object.freeze({
    registerProviderOrigin,
    findProviderOrigin,
    findProviderOriginById,
    ...publication,
    close: runtime.close,
  });
}
