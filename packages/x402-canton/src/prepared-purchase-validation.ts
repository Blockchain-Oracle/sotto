import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import { validatePreparedPurchaseGraph } from "./prepared-purchase-graph.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";
import { validatePreparedPurchaseMetadata } from "./prepared-purchase-metadata.js";

export function inspectPreparedPurchaseStructure(
  bytes: Uint8Array,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): void {
  const prepared = PreparedTransaction.fromBinary(bytes, {
    readUnknownField: "throw",
  });
  const canonical = PreparedTransaction.toBinary(prepared, {
    writeUnknownFields: false,
  });
  if (!Buffer.from(canonical).equals(Buffer.from(bytes))) {
    throw new Error("prepared transaction encoding is not canonical");
  }
  if (prepared.transaction === undefined || prepared.metadata === undefined) {
    throw new Error("prepared transaction or metadata is absent");
  }
  validatePreparedPurchaseMetadata(prepared.metadata, intent, request);
  validatePreparedPurchaseGraph(prepared.transaction, intent, request);
}
