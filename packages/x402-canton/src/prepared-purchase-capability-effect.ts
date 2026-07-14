import type { Create } from "@canton-network/core-ledger-proto";
import {
  preparedBoolean,
  preparedRecord,
  preparedScalar,
} from "./prepared-purchase-effect-values.js";
import type { PreparedPurchaseResult } from "./prepared-purchase-sotto-result.js";
import { validatePreparedSottoCreateIdentity } from "./prepared-purchase-sotto-identity.js";
import { HOLDING_INTERFACE_ID } from "./purchase-holding-types.js";
import {
  atomicToDamlDecimal,
  REVISION_PATTERN,
} from "./purchase-commitment-primitives.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

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

function replacementRevision(value: string): string {
  if (!REVISION_PATTERN.test(value)) {
    throw new Error("prepared capability effect revision is invalid");
  }
  const next = BigInt(value) + 1n;
  if (next > 9_223_372_036_854_775_807n) {
    throw new Error("prepared capability effect revision overflows");
  }
  return next.toString();
}

function replacementAllowance(
  intent: BoundedPurchaseLedgerIntent,
  result: PreparedPurchaseResult,
): string {
  const remaining =
    BigInt(intent.capability.remainingAllowanceAtomic) -
    BigInt(result.totalDebitAtomic);
  if (remaining < 0n) {
    throw new Error("prepared capability effect allowance is negative");
  }
  return atomicToDamlDecimal(remaining.toString(), "replacement allowance");
}

export function validatePreparedReplacementCapability(
  create: Create,
  intent: BoundedPurchaseLedgerIntent,
  result: PreparedPurchaseResult,
): void {
  validatePreparedSottoCreateIdentity(
    create,
    intent.capability.templateId,
    intent.challenge.payerParty,
    [intent.challenge.payerParty, intent.capability.agentParty],
    "replacement capability create",
  );
  const argument = preparedRecord(
    create.argument,
    CAPABILITY_FIELDS,
    "replacement capability argument",
    intent.capability.templateId,
  );
  const scalars = [
    ["payer", "party", intent.challenge.payerParty],
    ["agent", "party", intent.capability.agentParty],
    [
      "resourceBindingVersion",
      "text",
      intent.capability.resourceBindingVersion,
    ],
    ["allowedResourceHash", "text", intent.capability.resourceHash],
    ["allowedRecipient", "party", intent.capability.recipientParty],
    [
      "perCallLimit",
      "numeric",
      atomicToDamlDecimal(
        intent.capability.perCallLimitAtomic,
        "capability per-call limit",
      ),
    ],
    ["remainingAllowance", "numeric", replacementAllowance(intent, result)],
    [
      "maximumTotalDebit",
      "numeric",
      atomicToDamlDecimal(
        intent.capability.maximumTotalDebitAtomic,
        "capability maximum debit",
      ),
    ],
    ["expiresAt", "timestamp", micros(intent.capability.expiresAt)],
    [
      "revision",
      "int64",
      replacementRevision(intent.capability.expectedRevision),
    ],
    ["transferFactoryCid", "contractId", intent.tokenFactory.contractId],
    ["expectedAdmin", "party", intent.tokenFactory.expectedAdmin],
  ] as const;
  for (const [field, kind, expected] of scalars) {
    preparedScalar(
      argument.get(field),
      kind,
      expected,
      `replacement capability ${field}`,
    );
  }
  const instrument = preparedRecord(
    argument.get("instrumentId"),
    ["admin", "id"],
    "replacement capability instrument",
    `${HOLDING_INTERFACE_ID.split(":")[0]}:Splice.Api.Token.HoldingV1:InstrumentId`,
  );
  preparedScalar(
    instrument.get("admin"),
    "party",
    intent.challenge.instrument.admin,
    "replacement capability instrument admin",
  );
  preparedScalar(
    instrument.get("id"),
    "text",
    intent.challenge.instrument.id,
    "replacement capability instrument ID",
  );
  preparedBoolean(
    argument.get("paused"),
    false,
    "replacement capability paused",
  );
}
