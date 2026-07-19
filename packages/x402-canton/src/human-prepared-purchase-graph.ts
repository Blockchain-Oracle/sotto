import type { DamlTransaction } from "@canton-network/core-ledger-proto";
import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import { validateHumanPreparedPurchaseRoot } from "./human-prepared-purchase-root.js";
import type { PreparedPurchaseGraph } from "./prepared-purchase-graph-types.js";
import type { PreparedStructureBudget } from "./prepared-purchase-limits.js";
import { validatePreparedTransactionGraph } from "./prepared-transaction-graph.js";

export function validateHumanPreparedPurchaseGraph(
  transaction: DamlTransaction,
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
  budget: PreparedStructureBudget,
): PreparedPurchaseGraph {
  if (transaction.version !== "2.1") {
    throw new Error("prepared human transaction version is unsupported");
  }
  const graph = validatePreparedTransactionGraph(transaction, budget, (root) =>
    validateHumanPreparedPurchaseRoot(root, intent, request),
  );
  for (const node of graph.nodes.values()) {
    const lfVersion =
      node.kind === "exercise"
        ? node.exercise.lfVersion
        : node.kind === "create"
          ? node.create.lfVersion
          : node.fetch.lfVersion;
    if (lfVersion !== "2.1") {
      throw new Error("prepared human effect LF version is unsupported");
    }
  }
  return graph;
}
