import type {
  DamlTransaction,
  DamlTransaction_Node,
  Exercise,
} from "@canton-network/core-ledger-proto";

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

function children(node: DamlTransaction_Node): readonly string[] {
  const wrapper = node.versionedNode;
  if (wrapper.oneofKind !== "v1") fail("node version");
  const value = wrapper.v1.nodeType;
  if (value.oneofKind === "exercise") return value.exercise.children;
  if (value.oneofKind === "create" || value.oneofKind === "fetch") return [];
  fail("node kind");
}

function seeded(node: DamlTransaction_Node): boolean {
  const kind = node.versionedNode;
  return (
    kind.oneofKind === "v1" &&
    (kind.v1.nodeType.oneofKind === "exercise" ||
      kind.v1.nodeType.oneofKind === "create")
  );
}

export type ReferenceHumanWalletGraph = Readonly<{
  nodes: ReadonlyMap<string, DamlTransaction_Node>;
  root: Exercise;
}>;

export function validateReferenceHumanWalletGraph(
  transaction: DamlTransaction,
): ReferenceHumanWalletGraph {
  if (
    transaction.version !== "2.1" ||
    JSON.stringify(transaction.roots) !== '["0"]' ||
    transaction.nodes.length === 0 ||
    transaction.nodes.length > 128
  ) {
    fail("graph");
  }
  const nodes = new Map<string, DamlTransaction_Node>();
  for (const node of transaction.nodes) {
    if (
      !/^(?:0|[1-9][0-9]{0,9})$/u.test(node.nodeId) ||
      nodes.has(node.nodeId)
    ) {
      fail("node identity");
    }
    nodes.set(node.nodeId, node);
  }
  const referenced = new Map<string, number>();
  const visited = new Set<string>();
  const stack = ["0"];
  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (visited.has(nodeId)) fail("graph cycle");
    const node = nodes.get(nodeId);
    if (node === undefined) fail("child identity");
    visited.add(nodeId);
    for (const child of children(node)) {
      referenced.set(child, (referenced.get(child) ?? 0) + 1);
      stack.push(child);
    }
  }
  if (
    visited.size !== nodes.size ||
    referenced.has("0") ||
    [...nodes.keys()].some(
      (nodeId) => nodeId !== "0" && referenced.get(nodeId) !== 1,
    )
  ) {
    fail("graph reachability");
  }
  const expectedSeeds = new Set(
    [...nodes.values()].filter(seeded).map(({ nodeId }) => nodeId),
  );
  const actualSeeds = new Set<string>();
  for (const seed of transaction.nodeSeeds) {
    const nodeId = String(seed.nodeId);
    if (
      seed.seed.byteLength !== 32 ||
      actualSeeds.has(nodeId) ||
      !expectedSeeds.has(nodeId)
    ) {
      fail("node seed");
    }
    actualSeeds.add(nodeId);
  }
  if (actualSeeds.size !== expectedSeeds.size) fail("node seeds");
  const root = nodes.get("0")?.versionedNode;
  if (root?.oneofKind !== "v1" || root.v1.nodeType.oneofKind !== "exercise") {
    fail("root");
  }
  return Object.freeze({ nodes, root: root.v1.nodeType.exercise });
}
