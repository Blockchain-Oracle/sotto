import type { Value } from "@canton-network/core-ledger-proto";
import { FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID } from "./purchase-holding-types.js";

const TRANSFER_CONFIG_FIELDS = [
  "holdingFee",
  "maxNumInputs",
  "maxNumOutputs",
  "maxNumLockHolders",
] as const;

export type HumanTransferConfigShape = Readonly<{
  fields: readonly string[];
  hasTokenTtl: boolean;
}>;

export function selectHumanTransferConfigShape(
  value: Value | undefined,
  selectedPackageId: string,
  sourcePackageId: string,
): HumanTransferConfigShape {
  const historicalSource =
    sourcePackageId === FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID;
  const selectedSource = sourcePackageId === selectedPackageId;
  if (!historicalSource && !selectedSource) {
    throw new Error("prepared human external config source package is invalid");
  }
  const hasTokenTtl =
    !historicalSource &&
    selectedSource &&
    value?.sum.oneofKind === "record" &&
    value.sum.record.fields.some(
      ({ label }) => label === "tokenStandardMaxTTL",
    );
  return Object.freeze({
    fields: Object.freeze(
      hasTokenTtl
        ? [...TRANSFER_CONFIG_FIELDS, "tokenStandardMaxTTL"]
        : [...TRANSFER_CONFIG_FIELDS],
    ),
    hasTokenTtl,
  });
}
