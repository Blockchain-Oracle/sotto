import type { Value } from "@canton-network/core-ledger-proto";
import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import {
  preparedIdentifier,
  preparedParties,
  preparedRecord,
} from "./prepared-purchase-effect-values.js";
import {
  TRANSFER_EVENT_PACKAGE_ID,
  validateTransferEventChoice,
  type TransferEventExpectation,
} from "./prepared-purchase-event-log-values.js";
import { preparedPurchaseContextIds } from "./prepared-purchase-context-ids.js";
import type { PreparedFactoryResult } from "./prepared-purchase-factory-result.js";
import type {
  PreparedPurchaseGraph,
  PreparedPurchaseGraphNode,
} from "./prepared-purchase-graph-types.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

type ExerciseNode = Extract<PreparedPurchaseGraphNode, { kind: "exercise" }>;

function selectedPackage(intent: BoundedPurchaseLedgerIntent): string {
  const matches = intent.packageSelection.references.filter(
    ({ packageName }) => packageName === "splice-amulet",
  );
  if (matches.length !== 1) {
    throw new Error("prepared EventLog package is ambiguous");
  }
  return matches[0]!.packageId;
}

function eventOwner(value: Value | undefined): string {
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
  const account = preparedRecord(
    choice.get("account"),
    ["owner", "provider", "id"],
    "EventLog account",
    "4b7ecfc366d79ccc5ed07c80f26fe489cf2dfd43ce2856c06a78e6a048db7032:Splice.Api.Token.HoldingV2:Account",
  );
  const owner = account.get("owner");
  if (
    owner?.sum.oneofKind !== "optional" ||
    owner.sum.optional.value?.sum.oneofKind !== "party"
  ) {
    throw new Error("prepared EventLog account owner is absent");
  }
  return owner.sum.optional.value.sum.party;
}

function validateIdentity(
  node: ExerciseNode,
  intent: BoundedPurchaseLedgerIntent,
  contractId: string,
): void {
  const exercise = node.exercise;
  preparedIdentifier(
    exercise.templateId,
    `${selectedPackage(intent)}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
    "EventLog template",
  );
  preparedIdentifier(
    exercise.interfaceId,
    `${TRANSFER_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:EventLog`,
    "EventLog interface",
  );
  if (
    exercise.contractId !== contractId ||
    exercise.packageName !== "splice-amulet" ||
    exercise.choiceId !== "EventLog_HoldingsChange" ||
    exercise.consuming ||
    exercise.children.length !== 0 ||
    exercise.choiceObservers.length !== 1
  ) {
    throw new Error("prepared EventLog identity does not match");
  }
  preparedParties(
    exercise.actingParties,
    [intent.tokenFactory.expectedAdmin],
    "EventLog acting",
  );
  preparedParties(
    exercise.signatories,
    [intent.tokenFactory.expectedAdmin],
    "EventLog signatory",
  );
  preparedParties(
    exercise.stakeholders,
    [intent.tokenFactory.expectedAdmin],
    "EventLog stakeholder",
  );
  preparedRecord(
    exercise.exerciseResult,
    [],
    "EventLog result",
    `${TRANSFER_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:EventLog_HoldingsChangeResult`,
  );
}

export function validatePreparedPurchaseEventLogs(
  graph: PreparedPurchaseGraph,
  transfer: ExerciseNode,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
  result: PreparedFactoryResult,
): ReadonlySet<string> {
  const events = transfer.children
    .map((nodeId) => graph.nodes.get(nodeId))
    .filter(
      (node): node is ExerciseNode =>
        node?.kind === "exercise" &&
        node.exercise.choiceId === "EventLog_HoldingsChange",
    );
  if (transfer.exercise.choiceId !== "TransferPreapproval_SendV2") {
    if (events.length !== 0) {
      throw new Error("prepared legacy transfer contains EventLog effects");
    }
    return new Set();
  }
  if (events.length !== 2) {
    throw new Error(
      "prepared TransferPreapproval EventLog effects do not match",
    );
  }
  const contextId =
    preparedPurchaseContextIds(request).get("external-party-config-state") ??
    "";
  const amount = request.commands[0]!.ExerciseCommand.choiceArgument.amount;
  const expectations = new Map<string, TransferEventExpectation>([
    [
      intent.challenge.payerParty,
      {
        account: intent.challenge.payerParty,
        inputCids:
          request.commands[0]!.ExerciseCommand.choiceArgument.inputHoldingCids,
        observer: intent.challenge.payerParty,
        otherSide: intent.challenge.recipientParty,
        outputCids: result.senderChangeCids,
        side: "SenderSide",
      },
    ],
    [
      intent.challenge.recipientParty,
      {
        account: intent.challenge.recipientParty,
        inputCids: [],
        observer: intent.challenge.recipientParty,
        otherSide: intent.challenge.payerParty,
        outputCids: result.receiverHoldingCids,
        side: "ReceiverSide",
      },
    ],
  ]);
  const seen = new Set<string>();
  for (const event of events) {
    validateIdentity(event, intent, contextId);
    const owner = eventOwner(event.exercise.chosenValue);
    const expected = expectations.get(owner);
    if (expected === undefined || seen.has(owner)) {
      throw new Error("prepared EventLog account effects do not match");
    }
    preparedParties(
      event.exercise.choiceObservers,
      [owner],
      "EventLog choice observer",
    );
    validateTransferEventChoice(
      event.exercise.chosenValue,
      intent,
      amount,
      expected,
    );
    seen.add(owner);
  }
  if (seen.size !== expectations.size) {
    throw new Error("prepared EventLog account effects are incomplete");
  }
  return new Set(events.map(({ nodeId }) => nodeId));
}
