import {
  HOLDING_INTERFACE_ID,
  type HumanWalletApprovalRequest,
} from "@sotto/x402-canton";
import type { ReferenceHumanWalletGraph } from "./reference-human-wallet-graph.js";
import { validateReferenceHumanWalletEventLog } from "./reference-human-wallet-event-logs.js";
import {
  referenceHumanWalletCreate,
  referenceHumanWalletExercise,
  referenceHumanWalletFetch,
  validateReferenceHumanWalletArchive,
  validateReferenceHumanWalletFetch,
} from "./reference-human-wallet-descendant-nodes.js";
import type { ReferenceHumanWalletTransfer } from "./reference-human-wallet-transfer.js";

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
    validateReferenceHumanWalletEventLog(event, request, transfer, owner);
  }
}
