import type { Value } from "@canton-network/core-ledger-proto";
import {
  preparedContractIds,
  preparedIdentifier,
  preparedRecord,
  preparedScalar,
} from "./prepared-purchase-effect-values.js";
import { preparedEmptyMetadata } from "./prepared-purchase-metadata-values.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

export const TRANSFER_EVENT_PACKAGE_ID =
  "5c1097a9bad0af4bcfe6d3fb0fe55112d3d11f18eae57ddfb14c20836fee226c";
export const HOLDING_V2_PACKAGE_ID =
  "4b7ecfc366d79ccc5ed07c80f26fe489cf2dfd43ce2856c06a78e6a048db7032";

function optionalParty(
  value: Value | undefined,
  expected: string | undefined,
  label: string,
): void {
  if (value?.sum.oneofKind !== "optional") {
    throw new Error(`prepared ${label} must be optional`);
  }
  const party = value.sum.optional.value;
  if (expected === undefined) {
    if (party !== undefined) throw new Error(`prepared ${label} is not empty`);
    return;
  }
  preparedScalar(party, "party", expected, label);
}

function eventAccount(
  value: Value | undefined,
  owner: string,
  label: string,
): void {
  const account = preparedRecord(
    value,
    ["owner", "provider", "id"],
    label,
    `${HOLDING_V2_PACKAGE_ID}:Splice.Api.Token.HoldingV2:Account`,
  );
  optionalParty(account.get("owner"), owner, `${label} owner`);
  optionalParty(account.get("provider"), undefined, `${label} provider`);
  preparedScalar(account.get("id"), "text", "", `${label} ID`);
}

function eventParties(value: Value | undefined, label: string): string[] {
  if (value?.sum.oneofKind !== "list") {
    throw new Error(`prepared ${label} must be a party list`);
  }
  const parties = value.sum.list.elements.map((entry) => {
    if (entry.sum.oneofKind !== "party" || entry.sum.party === "") {
      throw new Error(`prepared ${label} contains a non-party`);
    }
    return entry.sum.party;
  });
  if (new Set(parties).size !== parties.length) {
    throw new Error(`prepared ${label} parties repeat`);
  }
  return parties;
}

export type TransferEventExpectation = Readonly<{
  account: string;
  inputCids: readonly string[];
  observer: string;
  otherSide: string;
  outputCids: readonly string[];
  side: "SenderSide" | "ReceiverSide";
}>;

export function validateTransferEventChoice(
  value: Value | undefined,
  intent: BoundedPurchaseLedgerIntent,
  amount: string,
  expected: TransferEventExpectation,
): void {
  const choice = preparedRecord(
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
    "EventLog holdings change",
    `${TRANSFER_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:EventLog_HoldingsChange`,
  );
  preparedScalar(
    choice.get("admin"),
    "party",
    intent.tokenFactory.expectedAdmin,
    "EventLog admin",
  );
  eventAccount(choice.get("account"), expected.account, "EventLog account");
  if (
    JSON.stringify(
      preparedContractIds(choice.get("inputHoldingCids"), "EventLog inputs"),
    ) !== JSON.stringify(expected.inputCids) ||
    JSON.stringify(
      preparedContractIds(choice.get("outputHoldingCids"), "EventLog outputs"),
    ) !== JSON.stringify(expected.outputCids)
  ) {
    throw new Error("prepared EventLog holding effects do not match");
  }
  if (
    JSON.stringify(
      eventParties(choice.get("observers"), "EventLog observers"),
    ) !== JSON.stringify([expected.observer])
  ) {
    throw new Error("prepared EventLog observers do not match");
  }
  validateTransferLeg(choice.get("transferLegSides"), intent, amount, expected);
  validateEmptyExtraArgs(choice.get("extraArgs"));
}

function validateTransferLeg(
  value: Value | undefined,
  intent: BoundedPurchaseLedgerIntent,
  amount: string,
  expected: TransferEventExpectation,
): void {
  if (value?.sum.oneofKind !== "list" || value.sum.list.elements.length !== 1) {
    throw new Error("prepared EventLog must contain one transfer leg");
  }
  const leg = preparedRecord(
    value.sum.list.elements[0],
    ["transferLegId", "side", "otherside", "amount", "instrumentId", "meta"],
    "EventLog transfer leg",
    `${TRANSFER_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:TransferLegSide`,
  );
  preparedScalar(
    leg.get("transferLegId"),
    "text",
    "leg0",
    "EventLog transfer leg ID",
  );
  const side = leg.get("side");
  if (
    side?.sum.oneofKind !== "enum" ||
    side.sum.enum.constructor !== expected.side
  ) {
    throw new Error("prepared EventLog transfer side does not match");
  }
  preparedIdentifier(
    side.sum.enum.enumId,
    `${TRANSFER_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:TransferSide`,
    "EventLog transfer side",
  );
  eventAccount(leg.get("otherside"), expected.otherSide, "EventLog other side");
  preparedScalar(leg.get("amount"), "numeric", amount, "EventLog amount");
  preparedScalar(
    leg.get("instrumentId"),
    "text",
    intent.challenge.instrument.id,
    "EventLog instrument",
  );
  preparedEmptyMetadata(leg.get("meta"), "EventLog transfer leg metadata");
}

function validateEmptyExtraArgs(value: Value | undefined): void {
  const extra = preparedRecord(
    value,
    ["context", "meta"],
    "EventLog extra args",
    "4ded6b668cb3b64f7a88a30874cd41c75829f5e064b3fbbadf41ec7e8363354f:Splice.Api.Token.MetadataV1:ExtraArgs",
  );
  const context = preparedRecord(
    extra.get("context"),
    ["values"],
    "EventLog context",
    "4ded6b668cb3b64f7a88a30874cd41c75829f5e064b3fbbadf41ec7e8363354f:Splice.Api.Token.MetadataV1:ChoiceContext",
  );
  const values = context.get("values");
  if (
    values?.sum.oneofKind !== "textMap" ||
    values.sum.textMap.entries.length !== 0
  ) {
    throw new Error("prepared EventLog context is not empty");
  }
  preparedEmptyMetadata(extra.get("meta"), "EventLog metadata");
}
