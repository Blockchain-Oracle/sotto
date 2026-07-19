import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import { validateHumanPreparedPurchaseEffects } from "./human-prepared-purchase-effects.js";
import { validateHumanPreparedPurchaseGraph } from "./human-prepared-purchase-graph.js";
import { validateHumanPreparedPurchaseMetadata } from "./human-prepared-purchase-metadata.js";
import type { PreparedStructureBudget } from "./prepared-purchase-limits.js";
import {
  recordPreparedPurchaseShape,
  type PreparedPurchaseShape,
} from "./prepared-purchase-shape.js";

export function inspectHumanPreparedPurchaseStructure(
  bytes: Uint8Array,
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): PreparedPurchaseShape {
  const startedAt = process.hrtime.bigint();
  const prepared = PreparedTransaction.fromBinary(bytes, {
    readUnknownField: "throw",
  });
  const canonical = PreparedTransaction.toBinary(prepared, {
    writeUnknownFields: false,
  });
  if (!Buffer.from(canonical).equals(Buffer.from(bytes))) {
    throw new Error("prepared human transaction encoding is not canonical");
  }
  if (prepared.transaction === undefined || prepared.metadata === undefined) {
    throw new Error("prepared human transaction or metadata is absent");
  }
  const budget: PreparedStructureBudget = { items: 0 };
  const metadata = validateHumanPreparedPurchaseMetadata(
    prepared.metadata,
    intent,
    request,
    budget,
  );
  const graph = validateHumanPreparedPurchaseGraph(
    prepared.transaction,
    intent,
    request,
    budget,
  );
  validateHumanPreparedPurchaseEffects(graph, metadata, intent, request);
  const elapsed = Number((process.hrtime.bigint() - startedAt) / 1_000n);
  if (!Number.isSafeInteger(elapsed) || elapsed < 0) {
    throw new Error("prepared human verification timing is invalid");
  }
  return recordPreparedPurchaseShape(graph, metadata, budget.items, elapsed);
}
