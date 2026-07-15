import { createHash } from "node:crypto";
import type { Value } from "@canton-network/core-ledger-proto";
import {
  preparedRecord,
  requirePreparedBoolean,
  requirePreparedScalar,
} from "./reference-wallet-prepared-values.js";
import type { SerializedReferenceWalletRequest } from "./reference-wallet-types.js";

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
const HOLDING_PACKAGE_ID =
  "718a0f77e505a8de22f188bd4c87fe74101274e9d4cb1bfac7d09aec7158d35b";

function damlDecimal(value: string, label: string): string {
  if (!/^(?:0|[1-9][0-9]{0,20})$/u.test(value)) {
    throw new Error(`reference wallet ${label} is invalid`);
  }
  const atomic = BigInt(value);
  const whole = atomic / 10_000_000_000n;
  const fraction = (atomic % 10_000_000_000n).toString().padStart(10, "0");
  return `${whole}.${fraction}`;
}

function capabilityArguments(request: SerializedReferenceWalletRequest) {
  const approval = request.approval;
  return Object.freeze({
    payer: approval.payerParty,
    agent: approval.agentParty,
    resourceBindingVersion: "sotto-resource-v1",
    allowedResourceHash: approval.resourceHash,
    allowedRecipient: approval.recipientParty,
    instrumentId: Object.freeze({ ...approval.instrument }),
    perCallLimit: damlDecimal(
      approval.limits.perCallLimitAtomic,
      "per-call limit",
    ),
    remainingAllowance: damlDecimal(
      approval.limits.remainingAllowanceAtomic,
      "remaining allowance",
    ),
    maximumTotalDebit: damlDecimal(
      approval.limits.maximumTotalDebitAtomic,
      "maximum total debit",
    ),
    expiresAt: approval.expiresAt,
    revision: approval.revision,
    paused: false,
    transferFactoryCid: approval.transferFactoryContractId,
    expectedAdmin: approval.instrument.admin,
  });
}

export function requireReferenceWalletCapabilityArgument(
  request: SerializedReferenceWalletRequest,
  value: Value | undefined,
): void {
  const approval = request.approval;
  const argument = capabilityArguments(request);
  const fields = preparedRecord(
    value,
    CAPABILITY_FIELDS,
    "capability approval",
    approval.templateId,
  );
  const scalar = (
    name: keyof typeof argument,
    kind: "contractId" | "int64" | "numeric" | "party" | "text" | "timestamp",
    expected: string,
  ) =>
    requirePreparedScalar(
      fields.get(name),
      kind,
      expected,
      `capability ${name}`,
    );
  scalar("payer", "party", argument.payer);
  scalar("agent", "party", argument.agent);
  scalar("resourceBindingVersion", "text", argument.resourceBindingVersion);
  scalar("allowedResourceHash", "text", argument.allowedResourceHash);
  scalar("allowedRecipient", "party", argument.allowedRecipient);
  const instrument = preparedRecord(
    fields.get("instrumentId"),
    ["admin", "id"],
    "capability instrument",
    `${HOLDING_PACKAGE_ID}:Splice.Api.Token.HoldingV1:InstrumentId`,
  );
  requirePreparedScalar(
    instrument.get("admin"),
    "party",
    argument.instrumentId.admin,
    "instrument admin",
  );
  requirePreparedScalar(
    instrument.get("id"),
    "text",
    argument.instrumentId.id,
    "instrument ID",
  );
  scalar("perCallLimit", "numeric", argument.perCallLimit);
  scalar("remainingAllowance", "numeric", argument.remainingAllowance);
  scalar("maximumTotalDebit", "numeric", argument.maximumTotalDebit);
  scalar(
    "expiresAt",
    "timestamp",
    (BigInt(Date.parse(argument.expiresAt)) * 1_000n).toString(),
  );
  scalar("revision", "int64", argument.revision);
  requirePreparedBoolean(fields.get("paused"), false, "capability paused");
  scalar("transferFactoryCid", "contractId", argument.transferFactoryCid);
  scalar("expectedAdmin", "party", argument.expectedAdmin);
}

export function referenceWalletCapabilityIntentHash(
  request: SerializedReferenceWalletRequest,
): string {
  const approval = request.approval;
  return createHash("sha256")
    .update(
      JSON.stringify({
        templateId: approval.templateId,
        packageId: approval.packageId,
        network: approval.network,
        synchronizerId: approval.synchronizerId,
        createArguments: capabilityArguments(request),
      }),
    )
    .digest("hex");
}
