import type { Value } from "@canton-network/core-ledger-proto";
import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import {
  REFERENCE_HUMAN_TOKEN_METADATA_PACKAGE_ID,
  validateReferenceHumanWalletEmptyMetadata,
  validateReferenceHumanWalletTransferMetadata,
} from "./reference-human-wallet-token-metadata.js";
import {
  referenceHumanDecimal,
  referenceHumanIdentifier,
  referenceHumanRecord,
  referenceHumanScalar,
} from "./reference-human-wallet-values.js";

export const REFERENCE_HUMAN_EVENT_PACKAGE_ID =
  "5c1097a9bad0af4bcfe6d3fb0fe55112d3d11f18eae57ddfb14c20836fee226c";
const HOLDING_V2_PACKAGE_ID =
  "4b7ecfc366d79ccc5ed07c80f26fe489cf2dfd43ce2856c06a78e6a048db7032";
export type ReferenceHumanWalletEventExpectation = Readonly<{
  inputIds: readonly string[];
  otherSide: string;
  outputIds: readonly string[];
  owner: string;
  side: "SenderSide" | "ReceiverSide";
}>;
function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}
function optionalParty(
  value: Value | undefined,
  expected: string | undefined,
  label: string,
): void {
  if (value?.sum.oneofKind !== "optional") fail(label);
  if (expected === undefined) {
    if (value.sum.optional.value !== undefined) fail(label);
    return;
  }
  referenceHumanScalar(value.sum.optional.value, "party", expected, label);
}
function account(value: Value | undefined, owner: string, label: string): void {
  const fields = referenceHumanRecord(
    value,
    ["owner", "provider", "id"],
    label,
    `${HOLDING_V2_PACKAGE_ID}:Splice.Api.Token.HoldingV2:Account`,
  );
  optionalParty(fields.get("owner"), owner, `${label} owner`);
  optionalParty(fields.get("provider"), undefined, `${label} provider`);
  referenceHumanScalar(fields.get("id"), "text", "", `${label} ID`);
}
function exactList(
  value: Value | undefined,
  kind: "contractId" | "party",
  expected: readonly string[],
  label: string,
): void {
  if (value?.sum.oneofKind !== "list") fail(label);
  const actual = value.sum.list.elements.map((entry) => {
    if (kind === "party" && entry.sum.oneofKind === kind)
      return entry.sum.party;
    if (kind === "contractId" && entry.sum.oneofKind === kind) {
      return entry.sum.contractId;
    }
    return fail(label);
  });
  if (
    actual.some((entry) => entry === "") ||
    new Set(actual).size !== actual.length ||
    JSON.stringify(actual) !== JSON.stringify(expected)
  ) {
    fail(label);
  }
}
function emptyExtraArgs(value: Value | undefined): void {
  const extra = referenceHumanRecord(
    value,
    ["context", "meta"],
    "EventLog extra args",
    `${REFERENCE_HUMAN_TOKEN_METADATA_PACKAGE_ID}:Splice.Api.Token.MetadataV1:ExtraArgs`,
  );
  const context = referenceHumanRecord(
    extra.get("context"),
    ["values"],
    "EventLog context",
    `${REFERENCE_HUMAN_TOKEN_METADATA_PACKAGE_ID}:Splice.Api.Token.MetadataV1:ChoiceContext`,
  );
  const values = context.get("values");
  if (
    values?.sum.oneofKind !== "textMap" ||
    values.sum.textMap.entries.length !== 0
  ) {
    fail("EventLog context");
  }
  validateReferenceHumanWalletEmptyMetadata(
    extra.get("meta"),
    "EventLog metadata",
  );
}

function transferLeg(
  value: Value | undefined,
  request: HumanWalletApprovalRequest,
  expected: ReferenceHumanWalletEventExpectation,
): void {
  if (value?.sum.oneofKind !== "list" || value.sum.list.elements.length !== 1) {
    fail("EventLog transfer legs");
  }
  const leg = referenceHumanRecord(
    value.sum.list.elements[0],
    ["transferLegId", "side", "otherside", "amount", "instrumentId", "meta"],
    "EventLog transfer leg",
    `${REFERENCE_HUMAN_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:TransferLegSide`,
  );
  referenceHumanScalar(
    leg.get("transferLegId"),
    "text",
    "leg0",
    "EventLog leg ID",
  );
  const side = leg.get("side");
  if (
    side?.sum.oneofKind !== "enum" ||
    side.sum.enum.constructor !== expected.side
  ) {
    fail("EventLog transfer side");
  }
  referenceHumanIdentifier(
    side.sum.enum.enumId,
    `${REFERENCE_HUMAN_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:TransferSide`,
    "EventLog transfer side",
  );
  account(leg.get("otherside"), expected.otherSide, "EventLog other side");
  referenceHumanScalar(
    leg.get("amount"),
    "numeric",
    referenceHumanDecimal(request.approval.amountAtomic),
    "EventLog amount",
  );
  referenceHumanScalar(
    leg.get("instrumentId"),
    "text",
    request.approval.instrument.id,
    "EventLog instrument",
  );
  validateReferenceHumanWalletTransferMetadata(
    leg.get("meta"),
    request,
    "EventLog transfer metadata",
  );
}

export function validateReferenceHumanWalletEventChoice(
  value: Value | undefined,
  request: HumanWalletApprovalRequest,
  expected: ReferenceHumanWalletEventExpectation,
): void {
  const choice = referenceHumanRecord(
    value,
    [
      "admin",
      "account",
      "inputHoldingCids",
      "transferLegSides",
      "outputHoldingCids",
      "observers",
      "extraArgs",
    ],
    "EventLog choice",
    `${REFERENCE_HUMAN_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:EventLog_HoldingsChange`,
  );
  referenceHumanScalar(
    choice.get("admin"),
    "party",
    request.approval.tokenFactory.expectedAdmin,
    "EventLog admin",
  );
  account(choice.get("account"), expected.owner, "EventLog account");
  exactList(
    choice.get("inputHoldingCids"),
    "contractId",
    expected.inputIds,
    "EventLog inputs",
  );
  exactList(
    choice.get("outputHoldingCids"),
    "contractId",
    expected.outputIds,
    "EventLog outputs",
  );
  exactList(
    choice.get("observers"),
    "party",
    [expected.owner],
    "EventLog observers",
  );
  transferLeg(choice.get("transferLegSides"), request, expected);
  emptyExtraArgs(choice.get("extraArgs"));
}
