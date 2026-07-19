import type { Exercise } from "@canton-network/core-ledger-proto";
import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import {
  REFERENCE_HUMAN_EVENT_PACKAGE_ID,
  validateReferenceHumanWalletEventChoice,
  type ReferenceHumanWalletEventExpectation,
} from "./reference-human-wallet-event-values.js";
import type { ReferenceHumanWalletTransfer } from "./reference-human-wallet-transfer.js";
import {
  referenceHumanIdentifier,
  referenceHumanParties,
  referenceHumanRecord,
} from "./reference-human-wallet-values.js";

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

function expectation(
  request: HumanWalletApprovalRequest,
  transfer: ReferenceHumanWalletTransfer,
  owner: string,
): ReferenceHumanWalletEventExpectation {
  const payer = request.approval.payerParty;
  const provider = request.approval.providerParty;
  return owner === payer
    ? {
        owner,
        otherSide: provider,
        side: "SenderSide",
        inputIds: transfer.inputHoldingIds,
        outputIds: transfer.changeIds,
      }
    : {
        owner,
        otherSide: payer,
        side: "ReceiverSide",
        inputIds: [],
        outputIds: transfer.receiverIds,
      };
}

export function validateReferenceHumanWalletEventLog(
  event: Exercise,
  request: HumanWalletApprovalRequest,
  transfer: ReferenceHumanWalletTransfer,
  owner: string,
): void {
  const approval = request.approval;
  referenceHumanIdentifier(
    event.templateId,
    `${approval.selectedPackage.packageId}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
    "EventLog template",
  );
  referenceHumanIdentifier(
    event.interfaceId,
    `${REFERENCE_HUMAN_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:EventLog`,
    "EventLog interface",
  );
  if (
    event.lfVersion !== "2.1" ||
    event.contractId !== transfer.configContractId ||
    event.packageName !== "splice-amulet" ||
    event.choiceId !== "EventLog_HoldingsChange" ||
    event.consuming ||
    event.children.length !== 0
  ) {
    fail("EventLog identity");
  }
  const admin = approval.tokenFactory.expectedAdmin;
  referenceHumanParties(event.actingParties, [admin], "EventLog acting");
  referenceHumanParties(event.signatories, [admin], "EventLog signatory");
  referenceHumanParties(event.stakeholders, [admin], "EventLog stakeholder");
  referenceHumanParties(event.choiceObservers, [owner], "EventLog observer");
  referenceHumanRecord(
    event.exerciseResult,
    [],
    "EventLog result",
    `${REFERENCE_HUMAN_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:EventLog_HoldingsChangeResult`,
  );
  validateReferenceHumanWalletEventChoice(
    event.chosenValue,
    request,
    expectation(request, transfer, owner),
  );
}
