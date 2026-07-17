import type { Value } from "@canton-network/core-ledger-proto";
import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import { referenceHumanWalletSignedAtomic } from "./reference-human-wallet-numbers.js";
import { referenceHumanRecord } from "./reference-human-wallet-values.js";

export type ReferenceHumanWalletBalanceChange = Readonly<{
  initialAtomic: bigint;
  rateAtomic: bigint;
}>;

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

export function readReferenceHumanWalletBalanceChanges(
  value: Value | undefined,
  request: HumanWalletApprovalRequest,
): ReadonlyMap<string, ReferenceHumanWalletBalanceChange> {
  if (value?.sum.oneofKind !== "genMap") fail("balance changes");
  const packageId = request.approval.selectedPackage.packageId;
  const result = new Map<string, ReferenceHumanWalletBalanceChange>();
  for (const entry of value.sum.genMap.entries) {
    if (
      entry.key?.sum.oneofKind !== "party" ||
      entry.key.sum.party === "" ||
      result.has(entry.key.sum.party)
    ) {
      fail("balance change parties");
    }
    const fields = referenceHumanRecord(
      entry.value,
      ["changeToInitialAmountAsOfRoundZero", "changeToHoldingFeesRate"],
      "balance change",
      `${packageId}:Splice.AmuletRules:BalanceChange`,
    );
    result.set(
      entry.key.sum.party,
      Object.freeze({
        initialAtomic: referenceHumanWalletSignedAtomic(
          fields.get("changeToInitialAmountAsOfRoundZero"),
          "balance change amount",
        ),
        rateAtomic: referenceHumanWalletSignedAtomic(
          fields.get("changeToHoldingFeesRate"),
          "balance change rate",
        ),
      }),
    );
  }
  const expected = new Set([
    request.approval.payerParty,
    request.approval.providerParty,
  ]);
  if (
    result.size !== expected.size ||
    [...result.keys()].some((party) => !expected.has(party))
  ) {
    fail("balance change parties");
  }
  return result;
}
