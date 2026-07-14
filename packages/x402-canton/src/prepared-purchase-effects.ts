import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import {
  preparedIdentifier,
  preparedParties,
  preparedRecord,
} from "./prepared-purchase-effect-values.js";
import { validatePreparedPurchaseFactory } from "./prepared-purchase-factory.js";
import type {
  PreparedPurchaseGraph,
  PreparedPurchaseGraphNode,
} from "./prepared-purchase-graph-types.js";
import { HOLDING_INTERFACE_ID } from "./purchase-holding-types.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

function selectedPackageId(
  intent: BoundedPurchaseLedgerIntent,
  packageName: string,
): string {
  const matches = intent.packageSelection.references.filter(
    (reference) => reference.packageName === packageName,
  );
  if (matches.length !== 1) {
    throw new Error("prepared effect selected package is ambiguous");
  }
  return matches[0]!.packageId;
}

function requireFactoryNode(
  graph: PreparedPurchaseGraph,
): Extract<PreparedPurchaseGraphNode, { kind: "exercise" }> {
  const root = graph.nodes.get(graph.rootId);
  if (root?.kind !== "exercise") {
    throw new Error("prepared Purchase effect root is absent");
  }
  const candidates = root.children
    .map((nodeId) => graph.nodes.get(nodeId))
    .filter(
      (
        node,
      ): node is Extract<PreparedPurchaseGraphNode, { kind: "exercise" }> =>
        node?.kind === "exercise" &&
        node.exercise.choiceId === "TransferFactory_Transfer",
    );
  if (candidates.length !== 1) {
    throw new Error("prepared Purchase factory effect is absent or additional");
  }
  return candidates[0]!;
}

function validateArchiveEffects(
  graph: PreparedPurchaseGraph,
  factory: Extract<PreparedPurchaseGraphNode, { kind: "exercise" }>,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): void {
  const archives: Extract<PreparedPurchaseGraphNode, { kind: "exercise" }>[] =
    [];
  for (const node of graph.nodes.values()) {
    if (node.kind !== "exercise" || node.nodeId === graph.rootId) continue;
    if (node.nodeId === factory.nodeId) continue;
    if (
      !factory.children.includes(node.nodeId) ||
      node.exercise.choiceId !== "Archive"
    ) {
      throw new Error("prepared Purchase has an unknown exercise effect");
    }
    archives.push(node);
  }
  const expected =
    request.commands[0]!.ExerciseCommand.choiceArgument.inputHoldingCids;
  if (
    archives.length !== expected.length ||
    JSON.stringify(
      archives.map(({ exercise }) => exercise.contractId).sort(),
    ) !== JSON.stringify([...expected].sort())
  ) {
    throw new Error("prepared Holding archive effects do not match inputs");
  }
  for (const { exercise } of archives) {
    preparedIdentifier(
      exercise.interfaceId,
      HOLDING_INTERFACE_ID,
      "Holding archive interface",
    );
    if (
      exercise.packageName !== "splice-amulet" ||
      !exercise.consuming ||
      exercise.choiceObservers.length !== 0
    ) {
      throw new Error(
        "prepared Holding archive effect identity does not match",
      );
    }
    preparedParties(
      exercise.actingParties,
      [intent.tokenFactory.expectedAdmin],
      "Holding archive acting",
    );
    preparedParties(
      exercise.signatories,
      [intent.tokenFactory.expectedAdmin],
      "Holding archive signatory",
    );
    preparedParties(
      exercise.stakeholders,
      [intent.tokenFactory.expectedAdmin, intent.challenge.payerParty],
      "Holding archive stakeholder",
    );
    preparedRecord(exercise.chosenValue, [], "Holding archive choice");
  }
}

function validateFactoryCreates(
  graph: PreparedPurchaseGraph,
  factory: Extract<PreparedPurchaseGraphNode, { kind: "exercise" }>,
  intent: BoundedPurchaseLedgerIntent,
): void {
  const creates = factory.children
    .map((nodeId) => graph.nodes.get(nodeId))
    .filter(
      (node): node is Extract<PreparedPurchaseGraphNode, { kind: "create" }> =>
        node?.kind === "create",
    );
  if (creates.length === 0) {
    throw new Error("prepared TransferFactory effect has no Holding creates");
  }
  const implementation = `${selectedPackageId(intent, "splice-amulet")}:Splice.Amulet:Amulet`;
  for (const { create } of creates) {
    preparedIdentifier(
      create.templateId,
      implementation,
      "TransferFactory Holding create",
    );
    if (create.packageName !== "splice-amulet") {
      throw new Error("prepared TransferFactory create effect package differs");
    }
  }
  if (
    factory.children.some((nodeId) => graph.nodes.get(nodeId)?.kind === "fetch")
  ) {
    throw new Error(
      "prepared TransferFactory effect contains an unknown fetch",
    );
  }
}

export function validatePreparedPurchaseEffects(
  graph: PreparedPurchaseGraph,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): void {
  const factory = requireFactoryNode(graph);
  validatePreparedPurchaseFactory(factory.exercise, intent, request);
  validateArchiveEffects(graph, factory, intent, request);
  validateFactoryCreates(graph, factory, intent);
}
