import type { Metadata } from "@canton-network/core-ledger-proto";
import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import type { PreparedStructureBudget } from "./prepared-purchase-limits.js";
import type { PreparedPurchaseMetadata } from "./prepared-purchase-metadata-types.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";
import {
  MAX_PREPARED_EVENT_BLOB_BYTES,
  MAX_PREPARED_INPUT_CONTRACTS,
  MAX_TOTAL_PREPARED_EVENT_BLOB_BYTES,
} from "./prepared-purchase-resource-envelope.js";
import { validatePreparedTransactionMetadata } from "./prepared-transaction-metadata.js";

export {
  MAX_PREPARED_EVENT_BLOB_BYTES,
  MAX_PREPARED_INPUT_CONTRACTS,
  MAX_TOTAL_PREPARED_EVENT_BLOB_BYTES,
};

export function validatePreparedPurchaseMetadata(
  metadata: Metadata,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
  budget: PreparedStructureBudget,
): PreparedPurchaseMetadata {
  return validatePreparedTransactionMetadata(
    metadata,
    {
      actAs: intent.actAs,
      commandId: request.commandId,
      executeBefore: intent.challenge.executeBefore,
      requestedAt: intent.challenge.requestedAt,
      synchronizerId: request.synchronizerId,
    },
    budget,
  );
}
