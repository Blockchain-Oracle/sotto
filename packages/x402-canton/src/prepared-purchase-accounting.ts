import type { PreparedHoldingAmounts } from "./prepared-purchase-holding-linkage.js";
import type { PreparedPurchaseResult } from "./prepared-purchase-sotto-result.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

export function validatePreparedPurchaseAccounting(
  holdings: PreparedHoldingAmounts,
  result: PreparedPurchaseResult,
  intent: BoundedPurchaseLedgerIntent,
): void {
  const principal = BigInt(intent.challenge.amountAtomic);
  const totalDebit = BigInt(result.totalDebitAtomic);
  const maximumDebit = BigInt(intent.capability.maximumTotalDebitAtomic);
  const allowance = BigInt(intent.capability.remainingAllowanceAtomic);
  if (holdings.receiver !== principal) {
    throw new Error(
      "prepared receiver Holding amount effect does not match principal",
    );
  }
  if (holdings.input - holdings.change !== totalDebit) {
    throw new Error(
      "prepared Holding debit conservation effect does not match",
    );
  }
  if (
    totalDebit < principal ||
    totalDebit > maximumDebit ||
    totalDebit > allowance
  ) {
    throw new Error("prepared Holding debit effect exceeds authorized bounds");
  }
}
