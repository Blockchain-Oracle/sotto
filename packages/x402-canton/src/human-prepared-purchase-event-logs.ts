import type { Value } from "@canton-network/core-ledger-proto";
import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import type { HumanPreparedTransferEffects } from "./human-prepared-purchase-transfer-effects.js";
import {
  preparedIdentifier,
  preparedParties,
  preparedRecord,
} from "./prepared-purchase-effect-values.js";
import {
  HOLDING_V2_PACKAGE_ID,
  TRANSFER_EVENT_PACKAGE_ID,
  validateTransferEventChoice,
  type TransferEventExpectation,
} from "./prepared-purchase-event-log-values.js";
import type {
  PreparedPurchaseGraph,
  PreparedPurchaseGraphNode,
} from "./prepared-purchase-graph-types.js";
import { preparedTransferContextIds } from "./prepared-transfer-context-ids.js";

type ExerciseNode = Extract<PreparedPurchaseGraphNode, { kind: "exercise" }>;

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
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
    "human EventLog holdings change",
    `${TRANSFER_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:EventLog_HoldingsChange`,
  );
  const account = preparedRecord(
    choice.get("account"),
    ["owner", "provider", "id"],
    "human EventLog account",
    `${HOLDING_V2_PACKAGE_ID}:Splice.Api.Token.HoldingV2:Account`,
  );
  const owner = account.get("owner");
  if (
    owner?.sum.oneofKind !== "optional" ||
    owner.sum.optional.value?.sum.oneofKind !== "party"
  ) {
    throw new Error("prepared human EventLog owner is absent");
  }
  return owner.sum.optional.value.sum.party;
}

function validateIdentity(
  node: ExerciseNode,
  intent: HumanPurchaseLedgerIntent,
  contractId: string,
): void {
  const exercise = node.exercise;
  preparedIdentifier(
    exercise.templateId,
    `${intent.packageSelection.packageIds[0]}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
    "human EventLog template",
  );
  preparedIdentifier(
    exercise.interfaceId,
    `${TRANSFER_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:EventLog`,
    "human EventLog interface",
  );
  if (
    exercise.contractId !== contractId ||
    exercise.packageName !== "splice-amulet" ||
    exercise.choiceId !== "EventLog_HoldingsChange" ||
    exercise.consuming ||
    exercise.children.length !== 0 ||
    exercise.choiceObservers.length !== 1
  ) {
    throw new Error("prepared human EventLog identity does not match");
  }
  const authority = [intent.tokenFactory.expectedAdmin];
  preparedParties(exercise.actingParties, authority, "human EventLog acting");
  preparedParties(exercise.signatories, authority, "human EventLog signatory");
  preparedParties(
    exercise.stakeholders,
    authority,
    "human EventLog stakeholder",
  );
  preparedRecord(
    exercise.exerciseResult,
    [],
    "human EventLog result",
    `${TRANSFER_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:EventLog_HoldingsChangeResult`,
  );
}

export function validateHumanPreparedEventLogs(
  graph: PreparedPurchaseGraph,
  transfer: HumanPreparedTransferEffects,
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): readonly string[] {
  const events = transfer.preapproval.children
    .map((nodeId) => graph.nodes.get(nodeId))
    .filter(
      (node): node is ExerciseNode =>
        node?.kind === "exercise" &&
        node.exercise.choiceId === "EventLog_HoldingsChange",
    );
  if (events.length !== 2) {
    throw new Error("prepared human EventLog effects do not match");
  }
  const command = request.commands[0].ExerciseCommand.choiceArgument;
  const contextId =
    preparedTransferContextIds(command.extraArgs.context).get(
      "external-party-config-state",
    ) ?? "";
  const metadata = command.transfer.meta.values;
  const expectations = new Map<string, TransferEventExpectation>([
    [
      intent.challenge.payerParty,
      {
        account: intent.challenge.payerParty,
        inputCids: command.transfer.inputHoldingCids,
        observer: intent.challenge.payerParty,
        otherSide: intent.challenge.recipientParty,
        outputCids: transfer.senderChangeCids,
        side: "SenderSide",
        metadata,
      },
    ],
    [
      intent.challenge.recipientParty,
      {
        account: intent.challenge.recipientParty,
        inputCids: [],
        observer: intent.challenge.recipientParty,
        otherSide: intent.challenge.payerParty,
        outputCids: transfer.receiverHoldingCids,
        side: "ReceiverSide",
        metadata,
      },
    ],
  ]);
  const seen = new Set<string>();
  const eventIds = new Map<string, string>();
  for (const event of events) {
    validateIdentity(event, intent, contextId);
    const owner = eventOwner(event.exercise.chosenValue);
    const expected = expectations.get(owner);
    if (expected === undefined || seen.has(owner)) {
      throw new Error("prepared human EventLog account effects do not match");
    }
    preparedParties(
      event.exercise.choiceObservers,
      [owner],
      "human EventLog observer",
    );
    validateTransferEventChoice(
      event.exercise.chosenValue,
      intent,
      command.transfer.amount,
      expected,
    );
    seen.add(owner);
    eventIds.set(owner, event.nodeId);
  }
  if (seen.size !== expectations.size) {
    throw new Error("prepared human EventLog effects are incomplete");
  }
  return Object.freeze(
    [intent.challenge.payerParty, intent.challenge.recipientParty]
      .sort(utf8Compare)
      .map((owner) => eventIds.get(owner)!),
  );
}
