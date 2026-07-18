import type { Pool } from "pg";
import {
  CATALOG_SELECT,
  recordFromRow,
  type CatalogRow,
} from "./catalog-rows.js";
import {
  CatalogPersistenceError,
  type ProviderOriginRecord,
} from "./catalog-types.js";

async function findRecord(
  pool: Pool,
  column: "origin.id" | "origin.normalized_origin",
  value: string,
): Promise<ProviderOriginRecord | null> {
  try {
    const result = await pool.query<CatalogRow>(
      `${CATALOG_SELECT}
       WHERE ${column} = $1
       ORDER BY registration.created_at, registration.registration_id
       LIMIT 1`,
      [value],
    );
    return result.rows[0] === undefined ? null : recordFromRow(result.rows[0]);
  } catch {
    throw new CatalogPersistenceError();
  }
}

export function findProviderOriginRecord(
  pool: Pool,
  normalizedOrigin: string,
): Promise<ProviderOriginRecord | null> {
  return findRecord(pool, "origin.normalized_origin", normalizedOrigin);
}

export function findProviderOriginRecordById(
  pool: Pool,
  originId: string,
): Promise<ProviderOriginRecord | null> {
  return findRecord(pool, "origin.id", originId);
}
