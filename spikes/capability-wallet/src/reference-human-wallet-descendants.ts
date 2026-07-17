import {
  HOLDING_INTERFACE_ID,
  type HumanWalletApprovalRequest,
} from "@sotto/x402-canton";
import type { ReferenceHumanWalletGraph } from "./reference-human-wallet-graph.js";
import {
  referenceHumanWalletCreate,
  referenceHumanWalletExercise,
  referenceHumanWalletFetch,
  validateReferenceHumanWalletArchive,
  validateReferenceHumanWalletFetch,
} from "./reference-human-wallet-descendant-nodes.js";
import type { ReferenceHumanWalletTransfer } from "./reference-human-wallet-transfer.js";
import {
  referenceHumanIdentifier,
  referenceHumanParties,
} from "./reference-human-wallet-values.js";

const EVENT_PACKAGE_ID =
  "5c1097a9bad0af4bcfe6d3fb0fe55112d3d11f18eae57ddfb14c20836fee226c";

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

function validateRootFetches(
  graph: ReferenceHumanWalletGraph,
  request: HumanWalletApprovalRequest,
  transfer: ReferenceHumanWalletTransfer,
): void {
  const approval = request.approval;
  const expected = [
    transfer.contractId,
    transfer.configContractId,
    transfer.configContractId,
    ...transfer.inputHoldingIds,
  ];
  if (
    graph.root.children.length !== expected.length + 1 ||
    graph.root.children.at(-1) !== transfer.nodeId
  ) {
    fail("root child order");
  }
  const candidates = expected.map((contractId, index) =>
    referenceHumanWalletFetch(graph, graph.root.children[index]!, contractId),
  );
  const admin = approval.tokenFactory.expectedAdmin;
  validateReferenceHumanWalletFetch(
    candidates[0]!,
    `${approval.selectedPackage.packageId}:Splice.AmuletRules:TransferPreapproval`,
    [...transfer.preapprovalParties],
    undefined,
    [...transfer.preapprovalParties],
    [admin],
  );
  for (const candidate of candidates.slice(1, 3)) {
    validateReferenceHumanWalletFetch(
      candidate,
      `${approval.selectedPackage.packageId}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
      [admin],
    );
  }
  for (const candidate of candidates.slice(3)) {
    validateReferenceHumanWalletFetch(
      candidate,
      `${approval.selectedPackage.packageId}:Splice.Amulet:Amulet`,
      [admin, approval.payerParty],
      HOLDING_INTERFACE_ID,
    );
  }
}

export function validateReferenceHumanWalletDescendants(
  graph: ReferenceHumanWalletGraph,
  request: HumanWalletApprovalRequest,
  transfer: ReferenceHumanWalletTransfer,
): void {
  validateRootFetches(graph, request, transfer);
  const preapproval = referenceHumanWalletExercise(graph, transfer.nodeId);
  const inputs = transfer.inputHoldingIds;
  const outputs = [...transfer.receiverIds, ...transfer.changeIds];
  const expectedLength = 2 + inputs.length * 2 + outputs.length + 2;
  if (preapproval.children.length !== expectedLength)
    fail("preapproval child count");
  const admin = request.approval.tokenFactory.expectedAdmin;
  const packageId = request.approval.selectedPackage.packageId;
  validateReferenceHumanWalletFetch(
    referenceHumanWalletFetch(
      graph,
      preapproval.children[0]!,
      transfer.configContractId,
    ),
    `${packageId}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
    [admin],
  );
  const manager = transfer.preapprovalParties.find(
    (party) => party !== admin && party !== request.approval.providerParty,
  );
  if (manager === undefined) fail("preapproval manager");
  validateReferenceHumanWalletFetch(
    referenceHumanWalletFetch(
      graph,
      preapproval.children[1]!,
      transfer.featuredContractId,
    ),
    `${packageId}:Splice.Amulet:FeaturedAppRight`,
    [admin],
    undefined,
    [admin, manager],
    [admin, manager],
  );
  let offset = 2;
  for (const contractId of inputs) {
    validateReferenceHumanWalletFetch(
      referenceHumanWalletFetch(
        graph,
        preapproval.children[offset++]!,
        contractId,
      ),
      `${packageId}:Splice.Amulet:Amulet`,
      [admin, request.approval.payerParty],
    );
    validateReferenceHumanWalletArchive(
      referenceHumanWalletExercise(graph, preapproval.children[offset++]!),
      request,
      contractId,
    );
  }
  for (const contractId of outputs) {
    referenceHumanWalletCreate(
      graph,
      preapproval.children[offset++]!,
      contractId,
    );
  }
  const eventOwners = [
    request.approval.payerParty,
    request.approval.providerParty,
  ].sort((left, right) =>
    Buffer.compare(Buffer.from(left), Buffer.from(right)),
  );
  for (const owner of eventOwners) {
    const event = referenceHumanWalletExercise(
      graph,
      preapproval.children[offset++]!,
    );
    referenceHumanIdentifier(
      event.interfaceId,
      `${EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:EventLog`,
      "EventLog interface",
    );
    if (
      event.contractId !== transfer.configContractId ||
      event.choiceId !== "EventLog_HoldingsChange" ||
      event.consuming ||
      event.children.length !== 0
    ) {
      fail("EventLog identity");
    }
    referenceHumanParties(event.actingParties, [admin], "EventLog acting");
    referenceHumanParties(event.signatories, [admin], "EventLog signatory");
    referenceHumanParties(event.stakeholders, [admin], "EventLog stakeholder");
    referenceHumanParties(event.choiceObservers, [owner], "EventLog observer");
  }
}
