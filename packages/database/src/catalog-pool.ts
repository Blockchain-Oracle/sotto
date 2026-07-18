import type { CatalogRepositoryInput } from "./catalog-types.js";
import {
  createPostgresPoolRuntime,
  type PostgresPoolRuntime,
} from "./postgres-pool.js";

export type CatalogPoolRuntime = PostgresPoolRuntime;

export function createCatalogPoolRuntime(
  input: CatalogRepositoryInput,
): CatalogPoolRuntime {
  return createPostgresPoolRuntime(input, {
    label: "catalog",
    defaultApplicationName: "sotto-catalog",
    poolError: Object.freeze({ code: "CATALOG_POOL_ERROR" as const }),
  });
}
