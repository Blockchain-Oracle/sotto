import type { DamlTransaction } from "@canton-network/core-ledger-proto";
import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import type { PreparedStructureBudget } from "./prepared-purchase-limits.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";
import type { PreparedPurchaseGraph } from "./prepared-purchase-graph-types.js";
import {
  MAX_PREPARED_DEPTH,
  MAX_PREPARED_EDGES,
  MAX_PREPARED_NODES,
} from "./prepared-purchase-resource-envelope.js";
import { validatePreparedPurchaseRoot } from "./prepared-purchase-root.js";
import { validatePreparedTransactionGraph } from "./prepared-transaction-graph.js";

export { MAX_PREPARED_DEPTH, MAX_PREPARED_EDGES, MAX_PREPARED_NODES };

export function validatePreparedPurchaseGraph(
  transaction: DamlTransaction,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
  budget: PreparedStructureBudget,
): PreparedPurchaseGraph {
  return validatePreparedTransactionGraph(transaction, budget, (root) =>
    validatePreparedPurchaseRoot(root, intent, request),
  );
}
