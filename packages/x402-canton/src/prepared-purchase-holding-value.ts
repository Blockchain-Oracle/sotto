import type { Create, Value } from "@canton-network/core-ledger-proto";
import {
  preparedIdentifier,
  preparedParties,
  preparedRecord,
  preparedScalar,
} from "./prepared-purchase-effect-values.js";
import { HOLDING_INTERFACE_ID } from "./purchase-holding-types.js";
import { damlDecimalToAtomic } from "./purchase-commitment-primitives.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

function validateRecordId(
  value: Value | undefined,
  packageIds: readonly string[],
  moduleName: string,
  entityName: string,
  label: string,
): void {
  const recordId =
    value?.sum.oneofKind === "record" ? value.sum.record.recordId : undefined;
  if (
    recordId === undefined ||
    !packageIds.includes(recordId.packageId) ||
    recordId.moduleName !== moduleName ||
    recordId.entityName !== entityName
  ) {
    throw new Error(`prepared ${label} effect identifier does not match`);
  }
}

function expiringAmount(
  value: Value | undefined,
  packageIds: readonly string[],
  label: string,
): bigint {
  validateRecordId(value, packageIds, "Splice.Fees", "ExpiringAmount", label);
  const amount = preparedRecord(
    value,
    ["initialAmount", "createdAt", "ratePerRound"],
    label,
  );
  const initial = amount.get("initialAmount");
  if (initial?.sum.oneofKind !== "numeric") {
    throw new Error(`prepared ${label} initial amount is invalid`);
  }
  if (initial.sum.numeric.startsWith("-")) {
    throw new Error(`prepared ${label} initial amount must be positive`);
  }
  const initialAtomic = BigInt(
    damlDecimalToAtomic(initial.sum.numeric, `${label} initial amount`),
  );
  if (initialAtomic <= 0n) {
    throw new Error(`prepared ${label} initial amount must be positive`);
  }
  const createdAtValue = amount.get("createdAt");
  validateRecordId(
    createdAtValue,
    packageIds,
    "Splice.Types",
    "Round",
    `${label} round`,
  );
  const createdAt = preparedRecord(
    createdAtValue,
    ["number"],
    `${label} round`,
  ).get("number");
  if (
    createdAt?.sum.oneofKind !== "int64" ||
    !/^(?:0|[1-9][0-9]{0,18})$/u.test(createdAt.sum.int64)
  ) {
    throw new Error(`prepared ${label} round is invalid`);
  }
  const rateValue = amount.get("ratePerRound");
  validateRecordId(
    rateValue,
    packageIds,
    "Splice.Fees",
    "RatePerRound",
    `${label} rate`,
  );
  const rate = preparedRecord(rateValue, ["rate"], `${label} rate`).get("rate");
  if (
    rate?.sum.oneofKind !== "numeric" ||
    BigInt(damlDecimalToAtomic(rate.sum.numeric, `${label} rate`)) < 0n
  ) {
    throw new Error(`prepared ${label} rate is invalid`);
  }
  return initialAtomic;
}

export function validatePreparedHoldingValue(
  create: Create,
  templateId: string,
  owner: string,
  intent: BoundedPurchaseLedgerIntent,
  label: string,
): bigint {
  preparedIdentifier(create.templateId, templateId, `${label} template`);
  if (create.packageName !== "splice-amulet") {
    throw new Error(`prepared ${label} package does not match`);
  }
  preparedParties(
    create.signatories,
    [intent.tokenFactory.expectedAdmin, owner],
    `${label} signatory`,
  );
  preparedParties(
    create.stakeholders,
    [intent.tokenFactory.expectedAdmin, owner],
    `${label} stakeholder`,
  );
  const selected = intent.packageSelection.references.filter(
    ({ packageName }) => packageName === "splice-amulet",
  );
  const argumentId = create.argument?.sum;
  if (
    selected.length !== 1 ||
    argumentId?.oneofKind !== "record" ||
    argumentId.record.recordId === undefined ||
    ![templateId.split(":")[0], selected[0]!.packageId].includes(
      argumentId.record.recordId.packageId,
    ) ||
    argumentId.record.recordId.moduleName !== "Splice.Amulet" ||
    argumentId.record.recordId.entityName !== "Amulet"
  ) {
    throw new Error(
      `prepared ${label} argument effect identifier does not match`,
    );
  }
  const fields = argumentId.record.fields.map(({ label: field }) => field);
  const concrete =
    JSON.stringify([...fields].sort()) ===
    JSON.stringify(["amount", "dso", "owner"]);
  const interfaceView =
    JSON.stringify([...fields].sort()) ===
    JSON.stringify(["amount", "instrumentId", "owner"]);
  if (!concrete && !interfaceView) {
    throw new Error(`prepared ${label} argument effect fields do not match`);
  }
  const argument = preparedRecord(
    create.argument,
    concrete ? ["dso", "owner", "amount"] : ["owner", "instrumentId", "amount"],
    `${label} argument`,
  );
  preparedScalar(argument.get("owner"), "party", owner, `${label} owner`);
  if (concrete) {
    preparedScalar(
      argument.get("dso"),
      "party",
      intent.tokenFactory.expectedAdmin,
      `${label} DSO`,
    );
    if (
      intent.challenge.instrument.admin !== intent.tokenFactory.expectedAdmin ||
      intent.challenge.instrument.id !== "Amulet"
    ) {
      throw new Error(`prepared ${label} concrete instrument does not match`);
    }
  } else {
    const instrument = preparedRecord(
      argument.get("instrumentId"),
      ["admin", "id"],
      `${label} instrument`,
      `${HOLDING_INTERFACE_ID.split(":")[0]}:Splice.Api.Token.HoldingV1:InstrumentId`,
    );
    preparedScalar(
      instrument.get("admin"),
      "party",
      intent.challenge.instrument.admin,
      `${label} instrument admin`,
    );
    preparedScalar(
      instrument.get("id"),
      "text",
      intent.challenge.instrument.id,
      `${label} instrument ID`,
    );
  }
  const amount = argument.get("amount");
  if (concrete) {
    return expiringAmount(
      amount,
      [templateId.split(":")[0]!, selected[0]!.packageId],
      `${label} amount`,
    );
  }
  if (amount?.sum.oneofKind !== "numeric") {
    throw new Error(`prepared ${label} amount is not numeric`);
  }
  return BigInt(
    damlDecimalToAtomic(amount.sum.numeric, `prepared ${label} amount`),
  );
}
