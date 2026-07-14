import type {
  DamlTransaction,
  DamlTransaction_Node,
} from "@canton-network/core-ledger-proto";
import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import {
  consumePreparedStructure,
  type PreparedStructureBudget,
  validatePreparedValue,
} from "./prepared-purchase-limits.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";
import { identifier } from "./purchase-commitment-primitives.js";
import type {
  PreparedPurchaseGraph,
  PreparedPurchaseGraphNode,
} from "./prepared-purchase-graph-types.js";
import {
  MAX_PREPARED_DEPTH,
  MAX_PREPARED_EDGES,
  MAX_PREPARED_NODES,
} from "./prepared-purchase-resource-envelope.js";
import { validatePreparedPurchaseRoot } from "./prepared-purchase-root.js";

export { MAX_PREPARED_DEPTH, MAX_PREPARED_EDGES, MAX_PREPARED_NODES };
const NODE_ID = /^(?:0|[1-9]\d{0,9})$/;
const MAX_NODE_ID = 2_147_483_647;

function canonicalNodeId(value: string, label: string): number {
  if (!NODE_ID.test(value)) throw new Error(`${label} is not canonical`);
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result > MAX_NODE_ID) {
    throw new Error(`${label} exceeds the supported range`);
  }
  return result;
}

function nodeDetails(
  node: DamlTransaction_Node,
  budget: PreparedStructureBudget,
): PreparedPurchaseGraphNode {
  if (node.versionedNode.oneofKind !== "v1") {
    throw new Error("prepared node version is unsupported");
  }
  const value = node.versionedNode.v1.nodeType;
  if (value.oneofKind === "rollback") {
    throw new Error("prepared Purchase must not contain rollback nodes");
  }
  if (value.oneofKind === "exercise") {
    identifier(value.exercise.lfVersion, "prepared exercise LF version", 32);
    validatePreparedValue(value.exercise.chosenValue, budget);
    validatePreparedValue(value.exercise.exerciseResult, budget);
    return {
      nodeId: node.nodeId,
      kind: "exercise",
      children: value.exercise.children,
      exercise: value.exercise,
    };
  }
  if (value.oneofKind === "create") {
    identifier(value.create.lfVersion, "prepared create LF version", 32);
    validatePreparedValue(value.create.argument, budget);
    return {
      nodeId: node.nodeId,
      kind: "create",
      children: [],
      create: value.create,
    };
  }
  if (value.oneofKind === "fetch") {
    identifier(value.fetch.lfVersion, "prepared fetch LF version", 32);
    return {
      nodeId: node.nodeId,
      kind: "fetch",
      children: [],
      fetch: value.fetch,
    };
  }
  throw new Error("prepared node type is absent or unsupported");
}

function validateSeeds(
  transaction: DamlTransaction,
  expected: ReadonlySet<number>,
): void {
  if (transaction.nodeSeeds.length > MAX_PREPARED_NODES) {
    throw new Error("prepared Purchase has too many node seeds");
  }
  const actual = new Set<number>();
  for (const seed of transaction.nodeSeeds) {
    if (
      !Number.isInteger(seed.nodeId) ||
      seed.nodeId < 0 ||
      seed.nodeId > MAX_NODE_ID ||
      seed.seed.byteLength !== 32 ||
      actual.has(seed.nodeId)
    ) {
      throw new Error("prepared Purchase node seeds are invalid");
    }
    actual.add(seed.nodeId);
  }
  if (
    actual.size !== expected.size ||
    [...expected].some((nodeId) => !actual.has(nodeId))
  ) {
    throw new Error("prepared Purchase node seeds do not cover effects");
  }
}

export function validatePreparedPurchaseGraph(
  transaction: DamlTransaction,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
  budget: PreparedStructureBudget,
): PreparedPurchaseGraph {
  identifier(transaction.version, "prepared transaction version", 32);
  if (
    transaction.roots.length !== 1 ||
    transaction.nodes.length === 0 ||
    transaction.nodes.length > MAX_PREPARED_NODES
  ) {
    throw new Error("prepared Purchase must have one bounded root graph");
  }
  const nodes = new Map<string, PreparedPurchaseGraphNode>();
  const indegree = new Map<string, number>();
  const seeded = new Set<number>();
  let edges = 0;
  for (const node of transaction.nodes) {
    const numericId = canonicalNodeId(node.nodeId, "prepared node ID");
    if (nodes.has(node.nodeId))
      throw new Error("prepared node IDs must be unique");
    const details = nodeDetails(node, budget);
    if (new Set(details.children).size !== details.children.length) {
      throw new Error("prepared child references must be unique");
    }
    edges += details.children.length;
    if (edges > MAX_PREPARED_EDGES)
      throw new Error("prepared graph has too many edges");
    consumePreparedStructure(budget, details.children.length);
    if (details.kind !== "fetch") seeded.add(numericId);
    nodes.set(node.nodeId, details);
    indegree.set(node.nodeId, 0);
  }
  const rootId = transaction.roots[0]!;
  canonicalNodeId(rootId, "prepared root ID");
  const root = nodes.get(rootId);
  if (root === undefined || root.kind !== "exercise") {
    throw new Error("prepared root must be an exercise");
  }
  for (const details of nodes.values()) {
    for (const child of details.children) {
      canonicalNodeId(child, "prepared child ID");
      if (!nodes.has(child)) throw new Error("prepared child does not exist");
      indegree.set(child, (indegree.get(child) ?? 0) + 1);
    }
  }
  for (const [nodeId, count] of indegree) {
    if (
      (nodeId === rootId && count !== 0) ||
      (nodeId !== rootId && count !== 1)
    ) {
      throw new Error("prepared graph is cyclic, shared, or disconnected");
    }
  }
  const reached = new Set<string>();
  const pending: Array<readonly [string, number]> = [[rootId, 1]];
  while (pending.length > 0) {
    const [nodeId, depth] = pending.pop()!;
    if (depth > MAX_PREPARED_DEPTH || reached.has(nodeId)) {
      throw new Error("prepared graph is cyclic or too deep");
    }
    reached.add(nodeId);
    for (const child of nodes.get(nodeId)!.children)
      pending.push([child, depth + 1]);
  }
  if (reached.size !== nodes.size)
    throw new Error("prepared graph is disconnected");
  validateSeeds(transaction, seeded);
  validatePreparedPurchaseRoot(root.exercise, intent, request);
  return Object.freeze({ rootId, nodes });
}
