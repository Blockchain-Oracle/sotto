import type {
  Create,
  DamlTransaction_Node,
  DamlTransaction_NodeSeed,
  Exercise,
  Fetch,
  Metadata_InputContract,
  Value,
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
  HISTORICAL_HOLDING_TEMPLATE_ID,
  HOLDING_INTERFACE_ID,
  holdingArgument,
  INPUT_AMOUNT,
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
    signatories: [admin],
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
    argument: holdingArgument(currentHoldingTemplate, intent, owner, amount),
    signatories: [admin],
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
        HISTORICAL_HOLDING_TEMPLATE_ID,
      ),
    ),
    exerciseNode("101", {
      ...common,
      contractId: intent.tokenFactory.contractId,
      packageName: "splice-amulet",
      templateId: fixtureIdentifier(intent.tokenFactory.creationTemplateId),
      interfaceId: fixtureIdentifier(intent.tokenFactory.interfaceId),
      signatories: [admin],
      stakeholders: [admin],
      actingParties: [payer],
      choiceId: "TransferFactory_Transfer",
      chosenValue: factoryChoice(intent, request),
      consuming: false,
      children: ["102", "103", "104"],
      exerciseResult: factoryResult(intent),
    }),
    exerciseNode("102", {
      ...common,
      contractId: PREPARED_PURCHASE_EFFECT_CIDS.inputHolding,
      packageName: "splice-amulet",
      templateId: fixtureIdentifier(HISTORICAL_HOLDING_TEMPLATE_ID),
      interfaceId: fixtureIdentifier(HOLDING_INTERFACE_ID),
      signatories: [admin],
      stakeholders: [admin, payer],
      actingParties: [admin],
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
  ];
}

export function buildEffectfulPreparedPurchaseSeeds(): DamlTransaction_NodeSeed[] {
  return [0, 101, 102, 103, 104, 106, 107].map((nodeId, index) => ({
    nodeId,
    seed: new Uint8Array(32).fill(index + 1),
  }));
}

function inputContract(
  contractId: string,
  packageName: string,
  templateId: string,
  argument: Value,
  signatories: string[],
  stakeholders: string[],
  marker: number,
): Metadata_InputContract {
  return {
    contract: {
      oneofKind: "v1",
      v1: {
        lfVersion: "2.1",
        contractId,
        packageName,
        templateId: fixtureIdentifier(templateId),
        argument,
        signatories,
        stakeholders,
      },
    },
    createdAt: BigInt(marker),
    eventBlob: new Uint8Array([marker]),
  };
}

export function buildEffectfulPreparedPurchaseInputs(
  intent: BoundedPurchaseLedgerIntent,
): Metadata_InputContract[] {
  const payer = intent.challenge.payerParty;
  const agent = intent.capability.agentParty;
  const admin = intent.tokenFactory.expectedAdmin;
  return [
    inputContract(
      intent.capability.contractId,
      "sotto-control",
      intent.capability.templateId,
      capabilityArgument(
        intent,
        "1.0000000000",
        intent.capability.expectedRevision,
      ),
      [payer],
      [payer, agent],
      1,
    ),
    inputContract(
      intent.tokenFactory.contractId,
      "splice-amulet",
      intent.tokenFactory.creationTemplateId,
      fixtureRecord(intent.tokenFactory.creationTemplateId, []),
      [admin],
      [admin],
      2,
    ),
    inputContract(
      PREPARED_PURCHASE_EFFECT_CIDS.inputHolding,
      "splice-amulet",
      HISTORICAL_HOLDING_TEMPLATE_ID,
      holdingArgument(
        HISTORICAL_HOLDING_TEMPLATE_ID,
        intent,
        payer,
        INPUT_AMOUNT,
      ),
      [admin],
      [admin, payer],
      3,
    ),
  ];
}
