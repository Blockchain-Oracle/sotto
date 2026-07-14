import type { Create } from "@canton-network/core-ledger-proto";
import {
  preparedIdentifier,
  preparedParties,
  preparedRecord,
  preparedScalar,
} from "./prepared-purchase-effect-values.js";
import { HOLDING_INTERFACE_ID } from "./purchase-holding-types.js";
import { damlDecimalToAtomic } from "./purchase-commitment-primitives.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

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
    [intent.tokenFactory.expectedAdmin],
    `${label} signatory`,
  );
  preparedParties(
    create.stakeholders,
    [intent.tokenFactory.expectedAdmin, owner],
    `${label} stakeholder`,
  );
  const argument = preparedRecord(
    create.argument,
    ["owner", "instrumentId", "amount"],
    `${label} argument`,
    templateId,
  );
  preparedScalar(argument.get("owner"), "party", owner, `${label} owner`);
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
  const amount = argument.get("amount");
  if (amount?.sum.oneofKind !== "numeric") {
    throw new Error(`prepared ${label} amount is not numeric`);
  }
  return BigInt(
    damlDecimalToAtomic(amount.sum.numeric, `prepared ${label} amount`),
  );
}
