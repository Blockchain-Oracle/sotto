import {
  canonicalTime,
  damlDecimalToAtomic,
  exactKeys,
  identifier,
  objectValue,
  REVISION_PATTERN,
  SHA256_PATTERN,
} from "./purchase-commitment-primitives.js";

export const BOUNDED_PURCHASE_CAPABILITY_TEMPLATE =
  "Sotto.Control.PurchaseCapability:BoundedPurchaseCapability" as const;
export const BOUNDED_PURCHASE_CAPABILITY_QUERY_ID =
  `#sotto-control:${BOUNDED_PURCHASE_CAPABILITY_TEMPLATE}` as const;
export const SOTTO_CONTROL_PACKAGE_ID =
  "4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57" as const;
export const APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID =
  `${SOTTO_CONTROL_PACKAGE_ID}:${BOUNDED_PURCHASE_CAPABILITY_TEMPLATE}` as const;
const DAML_TIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/;

export type PurchaseCapabilitySnapshot = Readonly<{
  agentParty: string;
  contractId: string;
  expectedAdmin: string;
  expiresAt: string;
  instrument: Readonly<{ admin: string; id: string }>;
  maximumTotalDebitAtomic: string;
  paused: boolean;
  payerParty: string;
  perCallLimitAtomic: string;
  recipient: string;
  remainingAllowanceAtomic: string;
  resourceBindingVersion: string;
  resourceHash: `sha256:${string}`;
  revision: string;
  templateId: string;
  transferFactoryContractId: string;
}>;

function normalizeDamlTime(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a Daml timestamp`);
  }
  const match = DAML_TIME_PATTERN.exec(value);
  if (match === null) {
    throw new Error(`${label} must be a Daml timestamp`);
  }
  const fraction = (match[2] ?? "").padEnd(6, "0");
  if (fraction.slice(3) !== "000") {
    throw new Error(`${label} has unsupported sub-millisecond precision`);
  }
  const normalized = `${match[1]}.${fraction.slice(0, 3)}Z`;
  canonicalTime(normalized, label);
  return normalized;
}

function requireOnlyParty(value: unknown, party: string, label: string): void {
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    identifier(value[0], label) !== party
  ) {
    throw new Error(`${label} must contain only the capability Party`);
  }
}

export function parsePurchaseCapabilityCreatedEvent(
  value: unknown,
): PurchaseCapabilitySnapshot {
  const event = objectValue(value, "capability created event");
  const contractId = identifier(event.contractId, "capability contractId");
  const templateId = identifier(event.templateId, "capability templateId", 256);
  if (templateId !== APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID) {
    throw new Error("capability templateId is not the approved template");
  }
  const argument = objectValue(
    event.createArgument,
    "capability createArgument",
  );
  exactKeys(
    argument,
    [
      "agent",
      "allowedRecipient",
      "allowedResourceHash",
      "expectedAdmin",
      "expiresAt",
      "instrumentId",
      "maximumTotalDebit",
      "paused",
      "payer",
      "perCallLimit",
      "remainingAllowance",
      "resourceBindingVersion",
      "revision",
      "transferFactoryCid",
    ],
    "capability createArgument",
  );
  const instrument = objectValue(
    argument.instrumentId,
    "capability instrumentId",
  );
  exactKeys(instrument, ["admin", "id"], "capability instrumentId");
  const revision = identifier(argument.revision, "capability revision", 19);
  if (
    !REVISION_PATTERN.test(revision) ||
    BigInt(revision) > 9_223_372_036_854_775_807n
  ) {
    throw new Error("capability revision must be a bounded integer");
  }
  if (typeof argument.paused !== "boolean") {
    throw new Error("capability paused must be boolean");
  }
  const resourceHash = identifier(
    argument.allowedResourceHash,
    "capability resourceHash",
  );
  if (!SHA256_PATTERN.test(resourceHash)) {
    throw new Error("capability resourceHash must be SHA-256");
  }
  if (event.packageName !== "sotto-control") {
    throw new Error("capability packageName is not approved");
  }
  const payerParty = identifier(argument.payer, "capability payerParty");
  const agentParty = identifier(argument.agent, "capability agentParty");
  requireOnlyParty(event.signatories, payerParty, "capability signatories");
  requireOnlyParty(event.observers, agentParty, "capability observers");
  const expiresAt = normalizeDamlTime(
    argument.expiresAt,
    "capability expiresAt",
  );
  return {
    agentParty,
    contractId,
    expectedAdmin: identifier(
      argument.expectedAdmin,
      "capability expectedAdmin",
    ),
    expiresAt,
    instrument: {
      admin: identifier(instrument.admin, "capability instrument admin"),
      id: identifier(instrument.id, "capability instrument id"),
    },
    maximumTotalDebitAtomic: damlDecimalToAtomic(
      argument.maximumTotalDebit,
      "capability maximumTotalDebit",
    ),
    paused: argument.paused,
    payerParty,
    perCallLimitAtomic: damlDecimalToAtomic(
      argument.perCallLimit,
      "capability perCallLimit",
    ),
    recipient: identifier(argument.allowedRecipient, "capability recipient"),
    remainingAllowanceAtomic: damlDecimalToAtomic(
      argument.remainingAllowance,
      "capability remainingAllowance",
    ),
    resourceBindingVersion: identifier(
      argument.resourceBindingVersion,
      "capability resourceBindingVersion",
    ),
    resourceHash: resourceHash as `sha256:${string}`,
    revision,
    templateId,
    transferFactoryContractId: identifier(
      argument.transferFactoryCid,
      "capability transferFactoryCid",
    ),
  };
}
