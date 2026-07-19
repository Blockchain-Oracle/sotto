import type {
  Create,
  DamlTransaction_Node,
  DamlTransaction_NodeSeed,
  Exercise,
  Fetch,
} from "@canton-network/core-ledger-proto";
import type {
  BoundedPurchaseLedgerIntent,
  BoundedPurchasePrepareRequest,
} from "../src/index.js";
import {
  ARCHIVE_RECORD_ID,
  capabilityArgument,
  CHANGE,
  contextArgument,
  factoryChoice,
  factoryResult,
  HOLDING_INTERFACE_ID,
  PREPARED_PURCHASE_EFFECT_CIDS,
  PRINCIPAL,
  REPLACEMENT_ALLOWANCE,
  rootChoice,
  rootResult,
  selectedSplicePackage,
} from "./prepared-purchase-effect-values.fixtures.js";
import {
  fixtureIdentifier,
  fixtureRecord,
} from "./prepared-purchase-value.fixtures.js";
import {
  EXTERNAL_PREAPPROVAL_THIRD_PARTY,
  externalEventChoice,
  externalHoldingArgument,
  externalPreapprovalChoice,
  externalPreapprovalResult,
} from "./prepared-purchase-external-values.fixtures.js";
import { EXTERNAL_PURCHASE_CONTEXT } from "./transfer-factory-observation.fixtures.js";
import { TRANSFER_EVENT_PACKAGE_ID } from "../src/prepared-purchase-event-log-values.js";

export { PREPARED_PURCHASE_EFFECT_CIDS };

function exerciseNode(
  nodeId: string,
  exercise: Exercise,
): DamlTransaction_Node {
  return {
    nodeId,
    versionedNode: {
      oneofKind: "v1",
      v1: { nodeType: { oneofKind: "exercise", exercise } },
    },
  };
}

function fetchNode(nodeId: string, fetch: Fetch): DamlTransaction_Node {
  return {
    nodeId,
    versionedNode: {
      oneofKind: "v1",
      v1: { nodeType: { oneofKind: "fetch", fetch } },
    },
  };
}

function createNode(nodeId: string, create: Create): DamlTransaction_Node {
  return {
    nodeId,
    versionedNode: {
      oneofKind: "v1",
      v1: { nodeType: { oneofKind: "create", create } },
    },
  };
}

export function buildEffectfulPreparedPurchaseNodes(
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): DamlTransaction_Node[] {
  const payer = intent.challenge.payerParty;
  const agent = intent.capability.agentParty;
  const provider = intent.challenge.recipientParty;
  const admin = intent.tokenFactory.expectedAdmin;
  const currentHoldingTemplate = `${selectedSplicePackage(intent)}:Splice.Amulet:Amulet`;
  const common = { lfVersion: "2.1", choiceObservers: [] };
  const holdingFetch = (contractId: string, templateId: string): Fetch => ({
    lfVersion: "2.1",
    contractId,
    packageName: "splice-amulet",
    templateId: fixtureIdentifier(templateId),
    interfaceId: fixtureIdentifier(HOLDING_INTERFACE_ID),
    signatories: [admin, payer],
    stakeholders: [admin, payer],
    actingParties: [payer],
  });
  const holdingCreate = (
    contractId: string,
    owner: string,
    amount: string,
  ): Create => ({
    lfVersion: "2.1",
    contractId,
    packageName: "splice-amulet",
    templateId: fixtureIdentifier(currentHoldingTemplate),
    argument: externalHoldingArgument(
      currentHoldingTemplate,
      intent,
      owner,
      amount,
    ),
    signatories: [admin, owner],
    stakeholders: [admin, owner],
  });
  return [
    exerciseNode("0", {
      ...common,
      contractId: intent.capability.contractId,
      packageName: "sotto-control",
      templateId: fixtureIdentifier(intent.capability.templateId),
      signatories: [payer],
      stakeholders: [payer, agent],
      actingParties: [agent],
      choiceId: "Purchase",
      chosenValue: rootChoice(intent, request),
      consuming: true,
      children: ["100", "101", "105", "106", "107"],
      exerciseResult: rootResult(intent),
    }),
    fetchNode(
      "100",
      holdingFetch(
        PREPARED_PURCHASE_EFFECT_CIDS.inputHolding,
        currentHoldingTemplate,
      ),
    ),
    exerciseNode("101", {
      ...common,
      contractId: intent.tokenFactory.contractId,
      packageName: "splice-amulet",
      templateId: fixtureIdentifier(
        `${selectedSplicePackage(intent)}:Splice.ExternalPartyAmuletRules:ExternalPartyAmuletRules`,
      ),
      interfaceId: fixtureIdentifier(intent.tokenFactory.interfaceId),
      signatories: [admin],
      stakeholders: [admin],
      actingParties: [payer],
      choiceId: "TransferFactory_Transfer",
      chosenValue: factoryChoice(intent, request),
      consuming: false,
      children: ["108"],
      exerciseResult: factoryResult(intent),
    }),
    exerciseNode("102", {
      ...common,
      contractId: PREPARED_PURCHASE_EFFECT_CIDS.inputHolding,
      packageName: "splice-amulet",
      templateId: fixtureIdentifier(currentHoldingTemplate),
      signatories: [admin, payer],
      stakeholders: [admin, payer],
      actingParties: [admin, payer],
      choiceId: "Archive",
      chosenValue: fixtureRecord(ARCHIVE_RECORD_ID, []),
      consuming: true,
      children: [],
      exerciseResult: { sum: { oneofKind: "unit", unit: {} } },
    }),
    createNode(
      "103",
      holdingCreate(
        PREPARED_PURCHASE_EFFECT_CIDS.receiverHolding,
        provider,
        PRINCIPAL,
      ),
    ),
    createNode(
      "104",
      holdingCreate(
        PREPARED_PURCHASE_EFFECT_CIDS.senderChangeHolding,
        payer,
        CHANGE,
      ),
    ),
    fetchNode(
      "105",
      holdingFetch(
        PREPARED_PURCHASE_EFFECT_CIDS.senderChangeHolding,
        currentHoldingTemplate,
      ),
    ),
    createNode("106", {
      lfVersion: "2.1",
      contractId: PREPARED_PURCHASE_EFFECT_CIDS.context,
      packageName: "sotto-control",
      templateId: fixtureIdentifier(
        `${fixtureIdentifier(intent.capability.templateId).packageId}:Sotto.Control.PurchaseCapability:PurchaseContext`,
      ),
      argument: contextArgument(intent),
      signatories: [payer],
      stakeholders: [payer, agent, provider],
    }),
    createNode("107", {
      lfVersion: "2.1",
      contractId: PREPARED_PURCHASE_EFFECT_CIDS.replacementCapability,
      packageName: "sotto-control",
      templateId: fixtureIdentifier(intent.capability.templateId),
      argument: capabilityArgument(intent, REPLACEMENT_ALLOWANCE, "8"),
      signatories: [payer],
      stakeholders: [payer, agent],
    }),
    exerciseNode("108", {
      ...common,
      contractId: EXTERNAL_PURCHASE_CONTEXT.transferPreapproval,
      packageName: "splice-amulet",
      templateId: fixtureIdentifier(
        `${selectedSplicePackage(intent)}:Splice.AmuletRules:TransferPreapproval`,
      ),
      signatories: [admin, provider, EXTERNAL_PREAPPROVAL_THIRD_PARTY],
      stakeholders: [admin, provider, EXTERNAL_PREAPPROVAL_THIRD_PARTY],
      actingParties: [payer],
      choiceId: "TransferPreapproval_SendV2",
      chosenValue: externalPreapprovalChoice(intent, request),
      consuming: false,
      children: ["102", "103", "104", "109", "110", "111", "112"],
      exerciseResult: externalPreapprovalResult(intent),
    }),
    fetchNode("109", {
      lfVersion: "2.1",
      contractId: EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
      packageName: "splice-amulet",
      templateId: fixtureIdentifier(
        `${selectedSplicePackage(intent)}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
      ),
      signatories: [admin],
      stakeholders: [admin],
      actingParties: [admin],
    }),
    fetchNode("110", {
      lfVersion: "2.1",
      contractId: EXTERNAL_PURCHASE_CONTEXT.featuredAppRight,
      packageName: "splice-amulet",
      templateId: fixtureIdentifier(
        `${selectedSplicePackage(intent)}:Splice.Amulet:FeaturedAppRight`,
      ),
      signatories: [admin],
      stakeholders: [admin, provider],
      actingParties: [admin],
    }),
    ...[
      ["111", payer],
      ["112", provider],
    ].map(([nodeId, owner]) =>
      exerciseNode(nodeId!, {
        ...common,
        contractId: EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
        packageName: "splice-amulet",
        templateId: fixtureIdentifier(
          `${selectedSplicePackage(intent)}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
        ),
        interfaceId: fixtureIdentifier(
          `${TRANSFER_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:EventLog`,
        ),
        signatories: [admin],
        stakeholders: [admin],
        actingParties: [admin],
        choiceId: "EventLog_HoldingsChange",
        chosenValue: externalEventChoice(intent, owner!),
        consuming: false,
        children: [],
        choiceObservers: [owner!],
        exerciseResult: fixtureRecord(
          `${TRANSFER_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:EventLog_HoldingsChangeResult`,
          [],
        ),
      }),
    ),
  ];
}

export function buildEffectfulPreparedPurchaseSeeds(): DamlTransaction_NodeSeed[] {
  return [0, 101, 102, 103, 104, 106, 107, 108, 111, 112].map(
    (nodeId, index) => ({
      nodeId,
      seed: new Uint8Array(32).fill(index + 1),
    }),
  );
}
