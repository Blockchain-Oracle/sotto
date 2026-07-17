import type {
  Create,
  DamlTransaction_Node,
  DamlTransaction_NodeSeed,
  Exercise,
  Fetch,
} from "@canton-network/core-ledger-proto";
import type {
  HumanPurchaseLedgerIntent,
  HumanPurchasePrepareRequest,
} from "../src/index.js";
import { TRANSFER_EVENT_PACKAGE_ID } from "../src/prepared-purchase-event-log-values.js";
import {
  ARCHIVE_RECORD_ID,
  HOLDING_INTERFACE_ID,
  PREPARED_PURCHASE_EFFECT_CIDS,
  PRINCIPAL,
} from "./prepared-purchase-effect-values.fixtures.js";
import {
  EXTERNAL_PREAPPROVAL_THIRD_PARTY,
  externalHoldingArgument,
} from "./prepared-purchase-external-values.fixtures.js";
import { humanPreparedRootExercise } from "./human-prepared-purchase-root.fixtures.js";
import {
  fixtureIdentifier,
  fixtureRecord,
} from "./prepared-purchase-value.fixtures.js";
import { EXTERNAL_PURCHASE_CONTEXT } from "./transfer-factory-observation.fixtures.js";
import {
  HUMAN_CHANGE,
  humanPreapprovalResult,
} from "./human-prepared-purchase-summary.fixtures.js";
import { humanPreparedInputVector } from "./human-prepared-purchase-input-vector.fixtures.js";
import {
  humanEventChoice,
  humanFactoryResult,
  humanPreapprovalChoice,
} from "./human-prepared-purchase-token-values.fixtures.js";

function node(nodeId: string, exercise: Exercise): DamlTransaction_Node {
  return {
    nodeId,
    versionedNode: {
      oneofKind: "v1",
      v1: { nodeType: { oneofKind: "exercise", exercise } },
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

function fetchNode(nodeId: string, fetch: Fetch): DamlTransaction_Node {
  return {
    nodeId,
    versionedNode: {
      oneofKind: "v1",
      v1: { nodeType: { oneofKind: "fetch", fetch } },
    },
  };
}

export function humanPreparedPurchaseNodes(
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): DamlTransaction_Node[] {
  const payer = intent.challenge.payerParty;
  const provider = intent.challenge.recipientParty;
  const admin = intent.tokenFactory.expectedAdmin;
  const packageId = intent.packageSelection.packageIds[0];
  const currentHolding = `${packageId}:Splice.Amulet:Amulet`;
  const inputs = humanPreparedInputVector(request);
  const eventEntries: Array<readonly [string, string]> = [
    ["7", payer],
    ["8", provider],
  ];
  eventEntries.sort((left, right) =>
    Buffer.compare(Buffer.from(left[1], "utf8"), Buffer.from(right[1], "utf8")),
  );
  const common = { lfVersion: "2.1", choiceObservers: [] as string[] };
  const root = humanPreparedRootExercise({ intent, request } as never);
  root.children = [
    "9",
    "10",
    "11",
    ...inputs.map(({ rootFetchNodeId }) => rootFetchNodeId),
    "1",
  ];
  root.exerciseResult = humanFactoryResult(intent, request);
  const holdingCreate = (
    contractId: string,
    owner: string,
    amount: string,
  ) => ({
    lfVersion: "2.1",
    contractId,
    packageName: "splice-amulet",
    templateId: fixtureIdentifier(currentHolding),
    argument: externalHoldingArgument(
      currentHolding,
      intent as never,
      owner,
      amount,
    ),
    signatories: [admin, owner],
    stakeholders: [admin, owner],
  });
  const inputFetch = (
    nodeId: string,
    contractId: string,
    includeInterface: boolean,
  ) =>
    fetchNode(nodeId, {
      lfVersion: "2.1",
      contractId,
      packageName: "splice-amulet",
      templateId: fixtureIdentifier(currentHolding),
      ...(includeInterface
        ? { interfaceId: fixtureIdentifier(HOLDING_INTERFACE_ID) }
        : {}),
      signatories: [admin, payer],
      stakeholders: [admin, payer],
      actingParties: [admin, payer],
    });
  const inputArchive = (nodeId: string, contractId: string) =>
    node(nodeId, {
      ...common,
      contractId,
      packageName: "splice-amulet",
      templateId: fixtureIdentifier(currentHolding),
      signatories: [admin, payer],
      stakeholders: [admin, payer],
      actingParties: [admin, payer],
      choiceId: "Archive",
      chosenValue: fixtureRecord(ARCHIVE_RECORD_ID, []),
      consuming: true,
      children: [],
      exerciseResult: { sum: { oneofKind: "unit", unit: {} } },
    });
  return [
    node("0", root),
    fetchNode("9", {
      lfVersion: "2.1",
      contractId: EXTERNAL_PURCHASE_CONTEXT.transferPreapproval,
      packageName: "splice-amulet",
      templateId: fixtureIdentifier(
        `${packageId}:Splice.AmuletRules:TransferPreapproval`,
      ),
      signatories: [admin, provider, EXTERNAL_PREAPPROVAL_THIRD_PARTY],
      stakeholders: [admin, provider, EXTERNAL_PREAPPROVAL_THIRD_PARTY],
      actingParties: [admin],
    }),
    ...["10", "11"].map((nodeId) =>
      fetchNode(nodeId, {
        lfVersion: "2.1",
        contractId: EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
        packageName: "splice-amulet",
        templateId: fixtureIdentifier(
          `${packageId}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
        ),
        signatories: [admin],
        stakeholders: [admin],
        actingParties: [admin],
      }),
    ),
    ...inputs.map(({ contractId, rootFetchNodeId }) =>
      inputFetch(rootFetchNodeId, contractId, true),
    ),
    node("1", {
      ...common,
      contractId: EXTERNAL_PURCHASE_CONTEXT.transferPreapproval,
      packageName: "splice-amulet",
      templateId: fixtureIdentifier(
        `${packageId}:Splice.AmuletRules:TransferPreapproval`,
      ),
      signatories: [admin, provider, EXTERNAL_PREAPPROVAL_THIRD_PARTY],
      stakeholders: [admin, provider, EXTERNAL_PREAPPROVAL_THIRD_PARTY],
      actingParties: [payer],
      choiceId: "TransferPreapproval_SendV2",
      chosenValue: humanPreapprovalChoice(intent, request),
      consuming: false,
      children: [
        "5",
        "6",
        ...inputs.flatMap(({ archiveNodeId, innerFetchNodeId }) => [
          innerFetchNodeId,
          archiveNodeId,
        ]),
        "3",
        "4",
        ...eventEntries.map(([nodeId]) => nodeId),
      ],
      exerciseResult: humanPreapprovalResult(intent, request),
    }),
    ...inputs.flatMap(({ archiveNodeId, contractId, innerFetchNodeId }) => [
      inputFetch(innerFetchNodeId, contractId, false),
      inputArchive(archiveNodeId, contractId),
    ]),
    createNode(
      "3",
      holdingCreate(
        PREPARED_PURCHASE_EFFECT_CIDS.receiverHolding,
        provider,
        PRINCIPAL,
      ),
    ),
    createNode(
      "4",
      holdingCreate(
        PREPARED_PURCHASE_EFFECT_CIDS.senderChangeHolding,
        payer,
        HUMAN_CHANGE,
      ),
    ),
    fetchNode("5", {
      lfVersion: "2.1",
      contractId: EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
      packageName: "splice-amulet",
      templateId: fixtureIdentifier(
        `${packageId}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
      ),
      signatories: [admin],
      stakeholders: [admin],
      actingParties: [admin],
    }),
    fetchNode("6", {
      lfVersion: "2.1",
      contractId: EXTERNAL_PURCHASE_CONTEXT.featuredAppRight,
      packageName: "splice-amulet",
      templateId: fixtureIdentifier(
        `${packageId}:Splice.Amulet:FeaturedAppRight`,
      ),
      signatories: [admin],
      stakeholders: [admin, EXTERNAL_PREAPPROVAL_THIRD_PARTY],
      actingParties: [admin, EXTERNAL_PREAPPROVAL_THIRD_PARTY],
    }),
    ...eventEntries.map(([nodeId, owner]) =>
      node(nodeId!, {
        ...common,
        contractId: EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
        packageName: "splice-amulet",
        templateId: fixtureIdentifier(
          `${packageId}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
        ),
        interfaceId: fixtureIdentifier(
          `${TRANSFER_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:EventLog`,
        ),
        signatories: [admin],
        stakeholders: [admin],
        actingParties: [admin],
        choiceId: "EventLog_HoldingsChange",
        chosenValue: humanEventChoice(intent, request, owner!),
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

export function humanPreparedPurchaseSeeds(
  request: HumanPurchasePrepareRequest,
): DamlTransaction_NodeSeed[] {
  const archives = humanPreparedInputVector(request).map(({ archiveNodeId }) =>
    Number(archiveNodeId),
  );
  return [0, 1, ...archives, 3, 4, 7, 8].map((nodeId, index) => ({
    nodeId,
    seed: new Uint8Array(32).fill(index + 1),
  }));
}

export { PREPARED_PURCHASE_EFFECT_CIDS };
