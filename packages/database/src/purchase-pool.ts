import {
  createPostgresPoolRuntime,
  type PostgresPoolRuntime,
} from "./postgres-pool.js";
import type { PurchaseRepositoryInput } from "./purchase-types.js";

export function createPurchasePoolRuntime(
  input: PurchaseRepositoryInput,
): PostgresPoolRuntime {
  return createPostgresPoolRuntime(input, {
    label: "purchase",
    defaultApplicationName: "sotto-purchase",
    poolError: Object.freeze({ code: "PURCHASE_POOL_ERROR" as const }),
  });
}
