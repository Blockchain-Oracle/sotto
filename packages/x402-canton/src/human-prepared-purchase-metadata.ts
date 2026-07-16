import type { Metadata } from "@canton-network/core-ledger-proto";
import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import type { PreparedStructureBudget } from "./prepared-purchase-limits.js";
import type { PreparedPurchaseMetadata } from "./prepared-purchase-metadata-types.js";
import { validatePreparedTransactionMetadata } from "./prepared-transaction-metadata.js";

export function validateHumanPreparedPurchaseMetadata(
  metadata: Metadata,
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
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
