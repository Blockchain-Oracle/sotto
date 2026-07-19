import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import { validatePreparedPurchaseAccounting } from "./prepared-purchase-accounting.js";
import {
  preparedIdentifier,
  preparedParties,
  preparedRecord,
} from "./prepared-purchase-effect-values.js";
import { validatePreparedPurchaseFactory } from "./prepared-purchase-factory.js";
import { validatePreparedPurchaseEventLogs } from "./prepared-purchase-event-log.js";
import { validatePreparedPurchaseFetchEffects } from "./prepared-purchase-fetch-effects.js";
import type {
  PreparedPurchaseGraph,
  PreparedPurchaseGraphNode,
} from "./prepared-purchase-graph-types.js";
import { validatePreparedHoldingLinkage } from "./prepared-purchase-holding-linkage.js";
import { validatePreparedPurchaseInputEffects } from "./prepared-purchase-input-effects.js";
import type { PreparedPurchaseMetadata } from "./prepared-purchase-metadata-types.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";
import { validatePreparedPurchaseSottoEffects } from "./prepared-purchase-sotto-effects.js";
import { selectPreparedTransferRoot } from "./prepared-purchase-transfer-preapproval.js";

const ARCHIVE_RECORD_ID =
  "9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69:DA.Internal.Template:Archive";

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
  transfer: Extract<PreparedPurchaseGraphNode, { kind: "exercise" }>,
  eventNodeIds: ReadonlySet<string>,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): void {
  const archives: Extract<PreparedPurchaseGraphNode, { kind: "exercise" }>[] =
    [];
  for (const node of graph.nodes.values()) {
    if (node.kind !== "exercise" || node.nodeId === graph.rootId) continue;
    if (node.nodeId === factory.nodeId) continue;
    if (node.nodeId === transfer.nodeId || eventNodeIds.has(node.nodeId)) {
      continue;
    }
    if (
      !transfer.children.includes(node.nodeId) ||
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
    const template = exercise.templateId;
    if (
      template === undefined ||
      template.moduleName !== "Splice.Amulet" ||
      template.entityName !== "Amulet" ||
      template.packageId !== selectedPackageId(intent, "splice-amulet")
    ) {
      throw new Error(
        "prepared Holding archive template effect identifier does not match",
      );
    }
    if (
      exercise.packageName !== "splice-amulet" ||
      exercise.interfaceId !== undefined ||
      !exercise.consuming ||
      exercise.choiceObservers.length !== 0
    ) {
      throw new Error(
        "prepared Holding archive effect identity does not match",
      );
    }
    preparedParties(
      exercise.actingParties,
      [intent.tokenFactory.expectedAdmin, intent.challenge.payerParty],
      "Holding archive acting",
    );
    preparedParties(
      exercise.signatories,
      [intent.tokenFactory.expectedAdmin, intent.challenge.payerParty],
      "Holding archive signatory",
    );
    preparedParties(
      exercise.stakeholders,
      [intent.tokenFactory.expectedAdmin, intent.challenge.payerParty],
      "Holding archive stakeholder",
    );
    preparedRecord(
      exercise.chosenValue,
      [],
      "Holding archive choice",
      ARCHIVE_RECORD_ID,
    );
    if (exercise.exerciseResult?.sum.oneofKind !== "unit") {
      throw new Error("prepared Holding archive result is not unit");
    }
  }
}

function validateFactoryCreates(
  graph: PreparedPurchaseGraph,
  transfer: Extract<PreparedPurchaseGraphNode, { kind: "exercise" }>,
  intent: BoundedPurchaseLedgerIntent,
): void {
  const creates = transfer.children
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
}

export function validatePreparedPurchaseEffects(
  graph: PreparedPurchaseGraph,
  metadata: PreparedPurchaseMetadata,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): void {
  const factory = requireFactoryNode(graph);
  const factoryResult = validatePreparedPurchaseFactory(
    factory.exercise,
    intent,
    request,
  );
  const transfer = selectPreparedTransferRoot(
    graph,
    factory,
    intent,
    request,
    factoryResult,
    metadata,
  );
  const eventNodeIds = validatePreparedPurchaseEventLogs(
    graph,
    transfer,
    intent,
    request,
    factoryResult,
  );
  validateArchiveEffects(
    graph,
    factory,
    transfer,
    eventNodeIds,
    intent,
    request,
  );
  validateFactoryCreates(graph, transfer, intent);
  const inputHoldings = validatePreparedPurchaseInputEffects(
    metadata,
    intent,
    request,
  );
  validatePreparedPurchaseFetchEffects(
    graph,
    metadata,
    factory,
    transfer,
    intent,
    request,
    factoryResult.senderChangeCids,
  );
  const result = validatePreparedPurchaseSottoEffects(
    graph,
    intent,
    request,
    factoryResult,
  );
  const holdings = validatePreparedHoldingLinkage(
    graph,
    inputHoldings,
    factoryResult,
    result.capabilityCid,
    result.contextCid,
    intent,
  );
  validatePreparedPurchaseAccounting(holdings, result, intent);
}
