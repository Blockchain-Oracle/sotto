import type { Pool } from "pg";
import { deferHumanReconciliationLease } from "./purchase-reconcile-checkpoint.js";
import { claimHumanReconciliationLease } from "./purchase-reconcile-lease.js";
import { completeHumanReconciliationLease } from "./purchase-reconcile-terminal.js";
import type { HumanReconciliationRepository } from "./purchase-reconciliation-types.js";
import {
  PurchaseConflictError,
  PurchasePersistenceError,
} from "./purchase-types.js";

export function createHumanReconciliationRepository(
  pool: Pool,
  admit: () => () => void,
): HumanReconciliationRepository {
  const run = <Result>(operation: () => Promise<Result>) => {
    const release = admit();
    return Promise.resolve()
      .then(operation)
      .catch((error: unknown) => {
        if (error instanceof PurchaseConflictError) throw error;
        throw new PurchasePersistenceError();
      })
      .finally(release);
  };
  return Object.freeze({
    claimHumanReconciliation: (input) =>
      run(() => claimHumanReconciliationLease(pool, input)),
    deferHumanReconciliation: (input) =>
      run(() => deferHumanReconciliationLease(pool, input)),
    completeHumanReconciliation: (input) =>
      run(() => completeHumanReconciliationLease(pool, input)),
  });
}
