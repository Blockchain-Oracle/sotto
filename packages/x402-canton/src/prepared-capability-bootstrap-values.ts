import type { Value } from "@canton-network/core-ledger-proto";
import type { BoundedCapabilityBootstrapPrepareRequest } from "./bounded-capability-bootstrap-prepare.js";
import {
  preparedBoolean,
  preparedRecord,
  preparedScalar,
} from "./prepared-purchase-effect-values.js";
import { HOLDING_INTERFACE_ID } from "./purchase-holding-types.js";

const CAPABILITY_FIELDS = [
  "payer",
  "agent",
  "resourceBindingVersion",
  "allowedResourceHash",
  "allowedRecipient",
  "instrumentId",
  "perCallLimit",
  "remainingAllowance",
  "maximumTotalDebit",
  "expiresAt",
  "revision",
  "paused",
  "transferFactoryCid",
  "expectedAdmin",
] as const;

function micros(value: string): string {
  return (BigInt(Date.parse(value)) * 1_000n).toString();
}

export function validatePreparedCapabilityBootstrapValue(
  value: Value | undefined,
  request: BoundedCapabilityBootstrapPrepareRequest,
): void {
  const expected = request.commands[0]!.CreateCommand;
  const argument = expected.createArguments;
  const fields = preparedRecord(
    value,
    CAPABILITY_FIELDS,
    "capability bootstrap argument",
    expected.templateId,
  );
  preparedScalar(
    fields.get("payer"),
    "party",
    argument.payer,
    "capability payer",
  );
  preparedScalar(
    fields.get("agent"),
    "party",
    argument.agent,
    "capability agent",
  );
  preparedScalar(
    fields.get("resourceBindingVersion"),
    "text",
    argument.resourceBindingVersion,
    "capability resource binding version",
  );
  preparedScalar(
    fields.get("allowedResourceHash"),
    "text",
    argument.allowedResourceHash,
    "capability resource hash",
  );
  preparedScalar(
    fields.get("allowedRecipient"),
    "party",
    argument.allowedRecipient,
    "capability recipient",
  );
  const instrument = preparedRecord(
    fields.get("instrumentId"),
    ["admin", "id"],
    "capability instrument",
    `${HOLDING_INTERFACE_ID.split(":")[0]}:Splice.Api.Token.HoldingV1:InstrumentId`,
  );
  preparedScalar(
    instrument.get("admin"),
    "party",
    argument.instrumentId.admin,
    "capability instrument admin",
  );
  preparedScalar(
    instrument.get("id"),
    "text",
    argument.instrumentId.id,
    "capability instrument ID",
  );
  preparedScalar(
    fields.get("perCallLimit"),
    "numeric",
    argument.perCallLimit,
    "capability per-call limit",
  );
  preparedScalar(
    fields.get("remainingAllowance"),
    "numeric",
    argument.remainingAllowance,
    "capability remaining allowance",
  );
  preparedScalar(
    fields.get("maximumTotalDebit"),
    "numeric",
    argument.maximumTotalDebit,
    "capability maximum total debit",
  );
  preparedScalar(
    fields.get("expiresAt"),
    "timestamp",
    micros(argument.expiresAt),
    "capability expiry",
  );
  preparedScalar(
    fields.get("revision"),
    "int64",
    argument.revision,
    "capability revision",
  );
  preparedBoolean(fields.get("paused"), argument.paused, "capability paused");
  preparedScalar(
    fields.get("transferFactoryCid"),
    "contractId",
    argument.transferFactoryCid,
    "capability transfer factory",
  );
  preparedScalar(
    fields.get("expectedAdmin"),
    "party",
    argument.expectedAdmin,
    "capability expected admin",
  );
}
