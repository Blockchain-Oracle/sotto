import { createPostgresPoolRuntime } from "./postgres-pool.js";
import { createHumanReconciliationRepository } from "./purchase-reconciliation-repository.js";
import type {
  HumanReconciliationRepositoryRuntime,
  HumanReconciliationRepositoryRuntimeInput,
} from "./purchase-reconciliation-types.js";

const INPUT_KEYS = new Set([
  "applicationName",
  "databaseUrl",
  "maxConnections",
  "onOperationalError",
]);

export function createHumanReconciliationRepositoryRuntime(
  input: HumanReconciliationRepositoryRuntimeInput,
): HumanReconciliationRepositoryRuntime {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !INPUT_KEYS.has(key))
  ) {
    throw new Error("human reconciliation repository input is invalid");
  }
  const runtime = createPostgresPoolRuntime(input, {
    label: "human reconciliation",
    defaultApplicationName: "sotto-human-reconcile",
    poolError: Object.freeze({
      code: "HUMAN_RECONCILIATION_POOL_ERROR" as const,
    }),
  });
  return Object.freeze({
    repository: createHumanReconciliationRepository(
      runtime.pool,
      runtime.admit,
    ),
    close: runtime.close,
  });
}
