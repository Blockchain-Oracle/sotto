import type { Create, Fetch } from "@canton-network/core-ledger-proto";
import {
  preparedIdentifier,
  preparedParties,
} from "./prepared-purchase-effect-values.js";
import type { PreparedFactoryResult } from "./prepared-purchase-factory-result.js";
import type {
  PreparedPurchaseGraph,
  PreparedPurchaseGraphNode,
} from "./prepared-purchase-graph-types.js";
import { validatePreparedHoldingValue } from "./prepared-purchase-holding-value.js";
import {
  FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID,
  HOLDING_INTERFACE_ID,
} from "./purchase-holding-types.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

type CreateNode = Extract<PreparedPurchaseGraphNode, { kind: "create" }>;
type FetchNode = Extract<PreparedPurchaseGraphNode, { kind: "fetch" }>;

export type PreparedHoldingAmounts = Readonly<{
  input: bigint;
  receiver: bigint;
  change: bigint;
}>;

function selectedHoldingTemplate(intent: BoundedPurchaseLedgerIntent): string {
  const matches = intent.packageSelection.references.filter(
    ({ packageName }) => packageName === "splice-amulet",
  );
  if (matches.length !== 1) {
    throw new Error("prepared Holding selected package is ambiguous");
  }
  return `${matches[0]!.packageId}:Splice.Amulet:Amulet`;
}

function exactIds(
  actual: readonly string[],
  expected: readonly string[],
): void {
  if (
    actual.length !== expected.length ||
    new Set(actual).size !== actual.length ||
    new Set(expected).size !== expected.length ||
    JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())
  ) {
    throw new Error("prepared Holding effect linkage does not match");
  }
}

function exactNode<T extends CreateNode | FetchNode>(
  nodes: readonly T[],
  contractId: string,
  label: string,
): T {
  const matches = nodes.filter((node) =>
    node.kind === "create"
      ? node.create.contractId === contractId
      : node.fetch.contractId === contractId,
  );
  if (matches.length !== 1) {
    throw new Error(`prepared ${label} effect is absent or duplicated`);
  }
  return matches[0]!;
}

function factoryDescendants(graph: PreparedPurchaseGraph): ReadonlySet<string> {
  const matches = [...graph.nodes.values()].filter(
    (node): node is Extract<PreparedPurchaseGraphNode, { kind: "exercise" }> =>
      node.kind === "exercise" &&
      node.exercise.choiceId === "TransferFactory_Transfer",
  );
  if (matches.length !== 1) {
    throw new Error("prepared Holding factory effect is ambiguous");
  }
  const descendants = new Set<string>();
  const pending = [...matches[0]!.children];
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (descendants.has(nodeId)) continue;
    descendants.add(nodeId);
    const node = graph.nodes.get(nodeId);
    if (node?.kind === "exercise") pending.push(...node.children);
  }
  return descendants;
}

function validateFetch(
  fetch: Fetch,
  templateIds: readonly string[],
  intent: BoundedPurchaseLedgerIntent,
  label: string,
): void {
  const template = fetch.templateId;
  if (
    template === undefined ||
    !templateIds.includes(
      `${template.packageId}:${template.moduleName}:${template.entityName}`,
    )
  ) {
    throw new Error(`prepared ${label} template does not match`);
  }
  preparedIdentifier(
    fetch.interfaceId,
    HOLDING_INTERFACE_ID,
    `${label} interface`,
  );
  if (fetch.packageName !== "splice-amulet") {
    throw new Error(`prepared ${label} package does not match`);
  }
  preparedParties(
    fetch.actingParties,
    [intent.challenge.payerParty],
    `${label} acting`,
  );
  preparedParties(
    fetch.signatories,
    [intent.tokenFactory.expectedAdmin, intent.challenge.payerParty],
    `${label} signatory`,
  );
  preparedParties(
    fetch.stakeholders,
    [intent.tokenFactory.expectedAdmin, intent.challenge.payerParty],
    `${label} stakeholder`,
  );
}

export function validatePreparedHoldingLinkage(
  graph: PreparedPurchaseGraph,
  inputHoldings: ReadonlyMap<string, Create>,
  factory: PreparedFactoryResult,
  capabilityCid: string,
  contextCid: string,
  intent: BoundedPurchaseLedgerIntent,
): PreparedHoldingAmounts {
  const root = graph.nodes.get(graph.rootId);
  if (root?.kind !== "exercise")
    throw new Error("prepared Holding root is absent");
  const creates = [...graph.nodes.values()].filter(
    (node): node is CreateNode => node.kind === "create",
  );
  const fetches = [...graph.nodes.values()].filter(
    (node): node is FetchNode => node.kind === "fetch",
  );
  const inputIds = [...inputHoldings.keys()];
  const outputIds = [
    ...factory.receiverHoldingCids,
    ...factory.senderChangeCids,
  ];
  exactIds(
    creates.map(({ create }) => create.contractId),
    [...outputIds, capabilityCid, contextCid],
  );
  const rootFetches = fetches.filter((node) =>
    root.children.includes(node.nodeId),
  );
  exactIds(
    rootFetches.map(({ fetch }) => fetch.contractId),
    [...inputIds, ...factory.senderChangeCids],
  );
  const historical = `${FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID}:Splice.Amulet:Amulet`;
  const current = selectedHoldingTemplate(intent);
  const factoryChildIds = factoryDescendants(graph);
  let input = 0n;
  for (const [contractId, create] of inputHoldings) {
    input += validatePreparedHoldingValue(
      create,
      historical,
      intent.challenge.payerParty,
      intent,
      "input Holding",
    );
    const fetch = exactNode(rootFetches, contractId, "input Holding fetch");
    if (!root.children.includes(fetch.nodeId)) {
      throw new Error(
        "prepared input Holding fetch is not a direct root effect",
      );
    }
    validateFetch(fetch.fetch, [current], intent, "input Holding fetch");
  }
  let receiver = 0n;
  for (const contractId of factory.receiverHoldingCids) {
    const create = exactNode(creates, contractId, "receiver Holding create");
    if (!factoryChildIds.has(create.nodeId)) {
      throw new Error(
        "prepared receiver Holding effect is outside the factory",
      );
    }
    receiver += validatePreparedHoldingValue(
      create.create,
      current,
      intent.challenge.recipientParty,
      intent,
      "receiver Holding",
    );
  }
  let change = 0n;
  for (const contractId of factory.senderChangeCids) {
    const create = exactNode(creates, contractId, "change Holding create");
    if (!factoryChildIds.has(create.nodeId)) {
      throw new Error("prepared change Holding effect is outside the factory");
    }
    change += validatePreparedHoldingValue(
      create.create,
      current,
      intent.challenge.payerParty,
      intent,
      "change Holding",
    );
    const fetch = exactNode(rootFetches, contractId, "change Holding fetch");
    if (!root.children.includes(fetch.nodeId)) {
      throw new Error(
        "prepared change Holding fetch is not a direct root effect",
      );
    }
    validateFetch(fetch.fetch, [current], intent, "change Holding fetch");
  }
  return Object.freeze({ input, receiver, change });
}
