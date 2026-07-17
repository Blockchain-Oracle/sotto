import type { Create, Value } from "@canton-network/core-ledger-proto";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import {
  preparedNumeric,
  preparedRecord,
} from "./prepared-purchase-effect-values.js";
import { validatePreparedHoldingValue } from "./prepared-purchase-holding-value.js";
import { damlDecimalToAtomic } from "./purchase-commitment-primitives.js";

export type HumanPreparedHoldingValue = Readonly<{
  initialAtomic: bigint;
  rateAtomic: bigint;
  round: bigint;
  roundZeroAtomic: bigint;
}>;

function recordId(
  value: Value | undefined,
  packageIds: readonly string[],
  moduleName: string,
  entityName: string,
  label: string,
): void {
  const id =
    value?.sum.oneofKind === "record" ? value.sum.record.recordId : undefined;
  if (
    id === undefined ||
    !packageIds.includes(id.packageId) ||
    id.moduleName !== moduleName ||
    id.entityName !== entityName
  ) {
    throw new Error(`prepared ${label} effect identifier does not match`);
  }
}

function nonnegativeAtomic(value: Value | undefined, label: string): bigint {
  const result = BigInt(
    damlDecimalToAtomic(preparedNumeric(value, label), label),
  );
  if (result < 0n) throw new Error(`prepared ${label} effect is negative`);
  return result;
}

function round(
  value: Value | undefined,
  packageIds: readonly string[],
): bigint {
  recordId(value, packageIds, "Splice.Types", "Round", "human Holding round");
  const number = preparedRecord(value, ["number"], "human Holding round").get(
    "number",
  );
  if (
    number?.sum.oneofKind !== "int64" ||
    !/^(?:0|[1-9]\d{0,18})$/u.test(number.sum.int64)
  ) {
    throw new Error("prepared human Holding round is invalid");
  }
  return BigInt(number.sum.int64);
}

export function readHumanPreparedHoldingValue(
  create: Create,
  templateId: string,
  owner: string,
  intent: HumanPurchaseLedgerIntent,
  label: string,
): HumanPreparedHoldingValue {
  if (create.lfVersion !== "2.1") {
    throw new Error(`prepared ${label} LF version is unsupported`);
  }
  const initialAtomic = validatePreparedHoldingValue(
    create,
    templateId,
    owner,
    intent,
    label,
  );
  const argument = preparedRecord(
    create.argument,
    ["dso", "owner", "amount"],
    `${label} argument`,
  );
  const packages = [
    templateId.split(":")[0]!,
    intent.packageSelection.packageIds[0],
  ];
  const amount = argument.get("amount");
  recordId(
    amount,
    packages,
    "Splice.Fees",
    "ExpiringAmount",
    `${label} amount`,
  );
  const fields = preparedRecord(
    amount,
    ["initialAmount", "createdAt", "ratePerRound"],
    `${label} amount`,
  );
  const parsedInitial = nonnegativeAtomic(
    fields.get("initialAmount"),
    `${label} initial amount`,
  );
  if (parsedInitial !== initialAtomic || initialAtomic <= 0n) {
    throw new Error(`prepared ${label} initial amount does not match`);
  }
  const createdAt = round(fields.get("createdAt"), packages);
  const rateValue = fields.get("ratePerRound");
  recordId(rateValue, packages, "Splice.Fees", "RatePerRound", `${label} rate`);
  const rateAtomic = nonnegativeAtomic(
    preparedRecord(rateValue, ["rate"], `${label} rate`).get("rate"),
    `${label} rate`,
  );
  return Object.freeze({
    initialAtomic,
    rateAtomic,
    round: createdAt,
    roundZeroAtomic: initialAtomic + rateAtomic * createdAt,
  });
}
