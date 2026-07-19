import type { Create, Fetch } from "@canton-network/core-ledger-proto";
import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import {
  preparedIdentifier,
  preparedParties,
} from "./prepared-purchase-effect-values.js";
import { preparedPurchaseContextIds } from "./prepared-purchase-context-ids.js";
import type {
  PreparedPurchaseGraph,
  PreparedPurchaseGraphNode,
} from "./prepared-purchase-graph-types.js";
import type { PreparedPurchaseMetadata } from "./prepared-purchase-metadata-types.js";
import { HOLDING_INTERFACE_ID } from "./purchase-holding-types.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

type ExerciseNode = Extract<PreparedPurchaseGraphNode, { kind: "exercise" }>;

function selectedSplicePackage(intent: BoundedPurchaseLedgerIntent): string {
  const matches = intent.packageSelection.references.filter(
    ({ packageName }) => packageName === "splice-amulet",
  );
  if (matches.length !== 1) {
    throw new Error(
      "prepared authenticated fetch selected package is ambiguous",
    );
  }
  return matches[0]!.packageId;
}

function parentOf(graph: PreparedPurchaseGraph, nodeId: string): ExerciseNode {
  const matches = [...graph.nodes.values()].filter(
    (node): node is ExerciseNode =>
      node.kind === "exercise" && node.children.includes(nodeId),
  );
  if (matches.length !== 1) {
    throw new Error("prepared fetch effect parent is ambiguous");
  }
  return matches[0]!;
}

function validateTemplate(
  fetch: Fetch,
  input: Create,
  intent: BoundedPurchaseLedgerIntent,
): void {
  const actual = fetch.templateId;
  const source = input.templateId;
  const selectedPackageId = selectedSplicePackage(intent);
  if (
    actual === undefined ||
    source === undefined ||
    actual.moduleName !== source.moduleName ||
    actual.entityName !== source.entityName ||
    actual.packageId !== selectedPackageId ||
    fetch.packageName !== input.packageName
  ) {
    throw new Error("prepared authenticated fetch template does not match");
  }
  if (fetch.interfaceId !== undefined) {
    preparedIdentifier(
      fetch.interfaceId,
      HOLDING_INTERFACE_ID,
      "authenticated fetch interface",
    );
    if (
      actual.moduleName !== "Splice.Amulet" ||
      actual.entityName !== "Amulet"
    ) {
      throw new Error("prepared authenticated fetch interface is invalid");
    }
  }
}

function validateAuthority(fetch: Fetch, input: Create): void {
  preparedParties(
    fetch.signatories,
    input.signatories,
    "authenticated fetch signatory",
  );
  preparedParties(
    fetch.stakeholders,
    input.stakeholders,
    "authenticated fetch stakeholder",
  );
  const actors = new Set(fetch.actingParties);
  const stakeholders = new Set(fetch.stakeholders);
  if (
    actors.size === 0 ||
    actors.size !== fetch.actingParties.length ||
    [...actors].some((party) => !stakeholders.has(party))
  ) {
    throw new Error("prepared authenticated fetch acting parties are invalid");
  }
}

export function validatePreparedPurchaseFetchEffects(
  graph: PreparedPurchaseGraph,
  metadata: PreparedPurchaseMetadata,
  factory: ExerciseNode,
  transfer: ExerciseNode,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
  senderChangeCids: readonly string[],
): void {
  const holdingIds =
    request.commands[0]!.ExerciseCommand.choiceArgument.inputHoldingCids;
  const rootAllowed = new Set([...holdingIds, ...senderChangeCids]);
  const contextIds = preparedPurchaseContextIds(request);
  const transferAllowed = new Set(
    [
      contextIds.get("external-party-config-state"),
      contextIds.get("featured-app-right"),
    ].filter((value): value is string => value !== undefined),
  );
  for (const node of graph.nodes.values()) {
    if (node.kind !== "fetch") continue;
    const parent = parentOf(graph, node.nodeId);
    const allowed =
      parent.nodeId === graph.rootId
        ? rootAllowed
        : parent.nodeId === transfer.nodeId
          ? transferAllowed
          : undefined;
    if (
      allowed === undefined ||
      !allowed.has(node.fetch.contractId) ||
      parent.nodeId === factory.nodeId
    ) {
      throw new Error("prepared fetch effect is outside authenticated scope");
    }
    if (senderChangeCids.includes(node.fetch.contractId)) continue;
    const input = metadata.inputContracts.get(node.fetch.contractId);
    if (input === undefined) {
      throw new Error("prepared authenticated fetch input is absent");
    }
    validateTemplate(node.fetch, input, intent);
    validateAuthority(node.fetch, input);
  }
}
