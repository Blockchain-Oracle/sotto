import type { Exercise } from "@canton-network/core-ledger-proto";
import {
  preparedContractIds,
  preparedNumeric,
  preparedRecord,
  preparedScalar,
} from "./prepared-purchase-effect-values.js";
import type { PreparedFactoryResult } from "./prepared-purchase-factory-result.js";
import { damlDecimalToAtomic } from "./purchase-commitment-primitives.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

export type PreparedPurchaseResult = Readonly<{
  capabilityCid: string;
  contextCid: string;
  receiverHoldingCids: readonly string[];
  totalDebitAtomic: string;
  totalDebitDecimal: string;
}>;

export function validatePreparedPurchaseResult(
  root: Exercise,
  capabilityCid: string,
  contextCid: string,
  factory: PreparedFactoryResult,
  intent: BoundedPurchaseLedgerIntent,
): PreparedPurchaseResult {
  const packageId = intent.capability.templateId.split(":")[0]!;
  const result = preparedRecord(
    root.exerciseResult,
    ["capabilityCid", "contextCid", "receiverHoldingCids", "totalDebit"],
    "Purchase result",
    `${packageId}:Sotto.Control.PurchaseCapability:PurchaseResult`,
  );
  preparedScalar(
    result.get("capabilityCid"),
    "contractId",
    capabilityCid,
    "Purchase result capability CID",
  );
  preparedScalar(
    result.get("contextCid"),
    "contractId",
    contextCid,
    "Purchase result context CID",
  );
  const receiverHoldingCids = preparedContractIds(
    result.get("receiverHoldingCids"),
    "Purchase result receiver holdings",
  );
  if (
    JSON.stringify(receiverHoldingCids) !==
    JSON.stringify(factory.receiverHoldingCids)
  ) {
    throw new Error("prepared Purchase result effect receivers do not match");
  }
  const totalDebitDecimal = preparedNumeric(
    result.get("totalDebit"),
    "Purchase result total debit",
  );
  const totalDebitAtomic = damlDecimalToAtomic(
    totalDebitDecimal,
    "prepared Purchase result total debit",
  );
  return Object.freeze({
    capabilityCid,
    contextCid,
    receiverHoldingCids: Object.freeze(receiverHoldingCids),
    totalDebitAtomic,
    totalDebitDecimal,
  });
}
