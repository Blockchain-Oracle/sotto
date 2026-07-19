import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import {
  preparedIdentifier,
  preparedParties,
} from "./prepared-purchase-effect-values.js";
import { preparedPurchaseContextIds } from "./prepared-purchase-context-ids.js";
import type { PreparedFactoryResult } from "./prepared-purchase-factory-result.js";
import type { PreparedPurchaseMetadata } from "./prepared-purchase-metadata-types.js";
import type {
  PreparedPurchaseGraph,
  PreparedPurchaseGraphNode,
} from "./prepared-purchase-graph-types.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";
import {
  validateTransferPreapprovalChoice,
  validateTransferPreapprovalResult,
} from "./prepared-purchase-transfer-preapproval-values.js";

type ExerciseNode = Extract<PreparedPurchaseGraphNode, { kind: "exercise" }>;

function selectedPackage(intent: BoundedPurchaseLedgerIntent): string {
  const matches = intent.packageSelection.references.filter(
    ({ packageName }) => packageName === "splice-amulet",
  );
  if (matches.length !== 1) {
    throw new Error("prepared preapproval package is ambiguous");
  }
  return matches[0]!.packageId;
}

function validateIdentity(
  node: ExerciseNode,
  intent: BoundedPurchaseLedgerIntent,
  contractId: string,
  packageId: string,
  metadata: PreparedPurchaseMetadata,
): void {
  const exercise = node.exercise;
  const authenticated = metadata.inputContracts.get(contractId);
  preparedIdentifier(
    exercise.templateId,
    `${packageId}:Splice.AmuletRules:TransferPreapproval`,
    "TransferPreapproval template",
  );
  if (
    exercise.interfaceId !== undefined ||
    exercise.contractId !== contractId ||
    exercise.packageName !== "splice-amulet" ||
    exercise.choiceId !== "TransferPreapproval_SendV2" ||
    exercise.consuming ||
    exercise.choiceObservers.length !== 0
  ) {
    throw new Error("prepared TransferPreapproval identity does not match");
  }
  preparedParties(
    exercise.actingParties,
    [intent.challenge.payerParty],
    "TransferPreapproval acting",
  );
  preparedParties(
    exercise.signatories,
    authenticated?.signatories ?? [],
    "TransferPreapproval authenticated signatory",
  );
  preparedParties(
    exercise.stakeholders,
    authenticated?.stakeholders ?? [],
    "TransferPreapproval authenticated stakeholder",
  );
  if (
    exercise.signatories.length !== 3 ||
    !exercise.signatories.includes(intent.tokenFactory.expectedAdmin) ||
    !exercise.signatories.includes(intent.challenge.recipientParty) ||
    exercise.signatories.includes(intent.challenge.payerParty)
  ) {
    throw new Error("prepared TransferPreapproval authority does not match");
  }
}

function validateFetches(
  graph: PreparedPurchaseGraph,
  node: ExerciseNode,
  request: BoundedPurchasePrepareRequest,
  intent: BoundedPurchaseLedgerIntent,
): void {
  const selectedPackageId = selectedPackage(intent);
  const disclosures = new Map(
    request.disclosedContracts.map((value) => [
      value.contractId,
      value.templateId,
    ]),
  );
  const fetches = node.children
    .map((childId) => graph.nodes.get(childId))
    .filter(
      (child): child is Extract<PreparedPurchaseGraphNode, { kind: "fetch" }> =>
        child?.kind === "fetch",
    );
  const contextIds = preparedPurchaseContextIds(request);
  const expected = [
    contextIds.get("external-party-config-state"),
    contextIds.get("featured-app-right"),
  ];
  if (
    expected.some((contractId) => contractId === undefined) ||
    JSON.stringify(fetches.map(({ fetch }) => fetch.contractId).sort()) !==
      JSON.stringify((expected as string[]).sort())
  ) {
    throw new Error("prepared TransferPreapproval fetch effects do not match");
  }
  for (const child of fetches) {
    const templateId = disclosures.get(child.fetch.contractId);
    if (templateId === undefined) {
      throw new Error("prepared TransferPreapproval fetch is not disclosed");
    }
    const [creationPackageId, moduleName, entityName] = templateId.split(":");
    const actual = child.fetch.templateId;
    if (
      actual === undefined ||
      !creationPackageId ||
      !moduleName ||
      !entityName ||
      actual.moduleName !== moduleName ||
      actual.entityName !== entityName ||
      ![creationPackageId, selectedPackageId].includes(actual.packageId)
    ) {
      throw new Error(
        "prepared TransferPreapproval fetch package selection does not match",
      );
    }
  }
}

export function selectPreparedTransferRoot(
  graph: PreparedPurchaseGraph,
  factory: ExerciseNode,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
  result: PreparedFactoryResult,
  metadata: PreparedPurchaseMetadata,
): ExerciseNode {
  const candidates = factory.children
    .map((id) => graph.nodes.get(id))
    .filter(
      (node): node is ExerciseNode =>
        node?.kind === "exercise" &&
        node.exercise.choiceId === "TransferPreapproval_SendV2",
    );
  if (candidates.length !== 1) {
    throw new Error(
      "prepared external transfer requires exactly one TransferPreapproval effect",
    );
  }
  const node = candidates[0]!;
  const contextIds = preparedPurchaseContextIds(request);
  const packageId = selectedPackage(intent);
  validateIdentity(
    node,
    intent,
    contextIds.get("transfer-preapproval") ?? "",
    packageId,
    metadata,
  );
  validateTransferPreapprovalChoice(
    node,
    intent,
    {
      amount: request.commands[0]!.ExerciseCommand.choiceArgument.amount,
      inputHoldingCids:
        request.commands[0]!.ExerciseCommand.choiceArgument.inputHoldingCids,
    },
    packageId,
    contextIds,
  );
  validateTransferPreapprovalResult(node, result, packageId);
  validateFetches(graph, node, request, intent);
  return node;
}
