import type { Exercise } from "@canton-network/core-ledger-proto";
import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import { validatePreparedReplacementCapability } from "./prepared-purchase-capability-effect.js";
import { validatePreparedPurchaseContext } from "./prepared-purchase-context-effect.js";
import type { PreparedFactoryResult } from "./prepared-purchase-factory-result.js";
import type {
  PreparedPurchaseGraph,
  PreparedPurchaseGraphNode,
} from "./prepared-purchase-graph-types.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";
import { validatePreparedPurchaseResult } from "./prepared-purchase-sotto-result.js";

type CreateNode = Extract<PreparedPurchaseGraphNode, { kind: "create" }>;

function exactCreate(
  nodes: readonly CreateNode[],
  templateId: string,
  label: string,
): CreateNode {
  const [packageId, moduleName, entityName] = templateId.split(":");
  const matches = nodes.filter(({ create }) => {
    const template = create.templateId;
    if (template === undefined) return false;
    return (
      template.packageId === packageId &&
      template.moduleName === moduleName &&
      template.entityName === entityName
    );
  });
  if (matches.length !== 1) {
    throw new Error(`prepared ${label} effect is absent or duplicated`);
  }
  return matches[0]!;
}

function findSottoCreates(
  graph: PreparedPurchaseGraph,
  intent: BoundedPurchaseLedgerIntent,
): Readonly<{ capability: CreateNode; context: CreateNode; root: Exercise }> {
  const root = graph.nodes.get(graph.rootId);
  if (root?.kind !== "exercise") {
    throw new Error("prepared Sotto effect root is absent");
  }
  const packageId = intent.capability.templateId.split(":")[0]!;
  const selectedPackage = intent.packageSelection.references.find(
    ({ packageName }) => packageName === "sotto-control",
  );
  if (selectedPackage?.packageId !== packageId) {
    throw new Error("prepared Sotto effect selected package does not match");
  }
  const candidates = [...graph.nodes.values()].filter(
    (node): node is CreateNode =>
      node.kind === "create" &&
      (node.create.packageName === "sotto-control" ||
        node.create.templateId?.packageId === packageId),
  );
  if (candidates.length !== 2) {
    throw new Error("prepared Sotto create effects are missing or additional");
  }
  const contextTemplate = `${packageId}:Sotto.Control.PurchaseCapability:PurchaseContext`;
  const capability = exactCreate(
    candidates,
    intent.capability.templateId,
    "replacement capability create",
  );
  const context = exactCreate(
    candidates,
    contextTemplate,
    "PurchaseContext create",
  );
  if (
    !root.children.includes(capability.nodeId) ||
    !root.children.includes(context.nodeId)
  ) {
    throw new Error(
      "prepared Sotto create effects are not direct root effects",
    );
  }
  return Object.freeze({ capability, context, root: root.exercise });
}

export function validatePreparedPurchaseSottoEffects(
  graph: PreparedPurchaseGraph,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
  factory: PreparedFactoryResult,
): void {
  const { capability, context, root } = findSottoCreates(graph, intent);
  const result = validatePreparedPurchaseResult(
    root,
    capability.create.contractId,
    context.create.contractId,
    factory,
    intent,
  );
  validatePreparedPurchaseContext(context.create, intent, request, result);
  validatePreparedReplacementCapability(capability.create, intent, result);
}
