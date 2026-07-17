import type {
  Create,
  Exercise,
  Fetch,
} from "@canton-network/core-ledger-proto";
import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import type { ReferenceHumanWalletGraph } from "./reference-human-wallet-graph.js";
import {
  referenceHumanIdentifier,
  referenceHumanParties,
  referenceHumanRecord,
} from "./reference-human-wallet-values.js";

const ARCHIVE_ID =
  "9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69:DA.Internal.Template:Archive";

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

function value(graph: ReferenceHumanWalletGraph, nodeId: string) {
  const node = graph.nodes.get(nodeId);
  if (node?.versionedNode.oneofKind !== "v1") fail("descendant node");
  return node;
}

export function referenceHumanWalletFetch(
  graph: ReferenceHumanWalletGraph,
  nodeId: string,
  contractId: string,
): Fetch {
  const node = value(graph, nodeId)!;
  if (
    node.versionedNode.oneofKind !== "v1" ||
    node.versionedNode.v1.nodeType.oneofKind !== "fetch" ||
    node.versionedNode.v1.nodeType.fetch.contractId !== contractId
  ) {
    fail("fetch order");
  }
  return node.versionedNode.v1.nodeType.fetch;
}

export function referenceHumanWalletExercise(
  graph: ReferenceHumanWalletGraph,
  nodeId: string,
): Exercise {
  const node = value(graph, nodeId)!;
  if (
    node.versionedNode.oneofKind !== "v1" ||
    node.versionedNode.v1.nodeType.oneofKind !== "exercise"
  ) {
    fail("exercise order");
  }
  return node.versionedNode.v1.nodeType.exercise;
}

export function referenceHumanWalletCreate(
  graph: ReferenceHumanWalletGraph,
  nodeId: string,
  contractId: string,
): Create {
  const node = value(graph, nodeId)!;
  if (
    node.versionedNode.oneofKind !== "v1" ||
    node.versionedNode.v1.nodeType.oneofKind !== "create" ||
    node.versionedNode.v1.nodeType.create.contractId !== contractId
  ) {
    fail("create order");
  }
  return node.versionedNode.v1.nodeType.create;
}

export function validateReferenceHumanWalletFetch(
  candidate: Fetch,
  template: string,
  signatories: readonly string[],
  interfaceId?: string,
  stakeholders: readonly string[] = signatories,
  actingParties: readonly string[] = signatories,
): void {
  referenceHumanIdentifier(candidate.templateId, template, "fetch template");
  if (
    candidate.lfVersion !== "2.1" ||
    candidate.packageName !== "splice-amulet" ||
    (interfaceId === undefined ? candidate.interfaceId !== undefined : false)
  ) {
    fail("fetch identity");
  }
  if (interfaceId !== undefined) {
    referenceHumanIdentifier(
      candidate.interfaceId,
      interfaceId,
      "fetch interface",
    );
  }
  referenceHumanParties(candidate.signatories, signatories, "fetch signatory");
  referenceHumanParties(
    candidate.stakeholders,
    stakeholders,
    "fetch stakeholder",
  );
  referenceHumanParties(candidate.actingParties, actingParties, "fetch acting");
}

export function validateReferenceHumanWalletArchive(
  candidate: Exercise,
  request: HumanWalletApprovalRequest,
  contractId: string,
): void {
  const authority = [
    request.approval.tokenFactory.expectedAdmin,
    request.approval.payerParty,
  ];
  referenceHumanIdentifier(
    candidate.templateId,
    `${request.approval.selectedPackage.packageId}:Splice.Amulet:Amulet`,
    "archive template",
  );
  if (
    candidate.contractId !== contractId ||
    candidate.lfVersion !== "2.1" ||
    candidate.packageName !== "splice-amulet" ||
    candidate.interfaceId !== undefined ||
    candidate.choiceId !== "Archive" ||
    !candidate.consuming ||
    candidate.children.length !== 0 ||
    candidate.choiceObservers.length !== 0 ||
    candidate.exerciseResult?.sum.oneofKind !== "unit"
  ) {
    fail("archive identity");
  }
  referenceHumanParties(candidate.actingParties, authority, "archive acting");
  referenceHumanParties(candidate.signatories, authority, "archive signatory");
  referenceHumanParties(
    candidate.stakeholders,
    authority,
    "archive stakeholder",
  );
  referenceHumanRecord(candidate.chosenValue, [], "archive choice", ARCHIVE_ID);
}
