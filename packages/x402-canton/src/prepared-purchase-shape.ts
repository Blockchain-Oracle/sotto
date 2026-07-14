import type { Identifier } from "@canton-network/core-ledger-proto";
import type {
  PreparedPurchaseGraph,
  PreparedPurchaseGraphNode,
} from "./prepared-purchase-graph-types.js";
import type { PreparedPurchaseMetadata } from "./prepared-purchase-metadata-types.js";
import { preparedValueShapeHash } from "./prepared-purchase-value-shape.js";

export const PREPARED_PURCHASE_SHAPE_VERSION =
  "sotto-prepared-purchase-shape-v1" as const;

export type PreparedPurchaseNodeShape = Readonly<{
  kind: "exercise" | "create" | "fetch";
  packageName: string;
  templateId: string;
  interfaceId: string | null;
  choice: string | null;
  consuming: boolean | null;
  childCount: number;
  valueShapeHashes: ReadonlyArray<`sha256:${string}`>;
}>;

export type PreparedPurchaseShape = Readonly<{
  version: typeof PREPARED_PURCHASE_SHAPE_VERSION;
  nodeCount: number;
  edgeCount: number;
  inputContractCount: number;
  inputTemplateIds: ReadonlyArray<string>;
  inputValueShapeHashes: ReadonlyArray<`sha256:${string}`>;
  nodeKinds: Readonly<{ exercise: number; create: number; fetch: number }>;
  nodes: ReadonlyArray<PreparedPurchaseNodeShape>;
  valueWorkUnits: number;
  verificationElapsedMicroseconds: number;
}>;

function preparedId(value: Identifier | undefined, label: string): string {
  if (
    value === undefined ||
    !value.packageId ||
    !value.moduleName ||
    !value.entityName
  ) {
    throw new Error(`prepared shape ${label} identifier is absent`);
  }
  return `${value.packageId}:${value.moduleName}:${value.entityName}`;
}

function nodeShape(node: PreparedPurchaseGraphNode): PreparedPurchaseNodeShape {
  const value =
    node.kind === "exercise"
      ? node.exercise
      : node.kind === "create"
        ? node.create
        : node.fetch;
  const hashes =
    node.kind === "exercise"
      ? [
          preparedValueShapeHash(node.exercise.chosenValue),
          preparedValueShapeHash(node.exercise.exerciseResult),
        ]
      : node.kind === "create"
        ? [preparedValueShapeHash(node.create.argument)]
        : [];
  const interfaceId =
    node.kind === "exercise"
      ? node.exercise.interfaceId
      : node.kind === "fetch"
        ? node.fetch.interfaceId
        : undefined;
  return Object.freeze({
    kind: node.kind,
    packageName: value.packageName,
    templateId: preparedId(value.templateId, "template"),
    interfaceId:
      interfaceId === undefined ? null : preparedId(interfaceId, "interface"),
    choice: node.kind === "exercise" ? node.exercise.choiceId : null,
    consuming: node.kind === "exercise" ? node.exercise.consuming : null,
    childCount: node.children.length,
    valueShapeHashes: Object.freeze(hashes),
  });
}

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function recordPreparedPurchaseShape(
  graph: PreparedPurchaseGraph,
  metadata: PreparedPurchaseMetadata,
  valueWorkUnits: number,
  verificationElapsedMicroseconds: number,
): PreparedPurchaseShape {
  const nodes = [...graph.nodes.values()]
    .map(nodeShape)
    .sort((left, right) =>
      utf8Compare(JSON.stringify(left), JSON.stringify(right)),
    );
  const nodeKinds = { exercise: 0, create: 0, fetch: 0 };
  for (const node of nodes) nodeKinds[node.kind] += 1;
  const inputs = [...metadata.inputContracts.values()];
  const inputTemplateIds = inputs
    .map(({ templateId }) => preparedId(templateId, "input template"))
    .sort(utf8Compare);
  const inputValueShapeHashes = inputs
    .map(({ argument }) => preparedValueShapeHash(argument))
    .sort(utf8Compare);
  return Object.freeze({
    version: PREPARED_PURCHASE_SHAPE_VERSION,
    nodeCount: nodes.length,
    edgeCount: nodes.reduce((total, node) => total + node.childCount, 0),
    inputContractCount: inputs.length,
    inputTemplateIds: Object.freeze(inputTemplateIds),
    inputValueShapeHashes: Object.freeze(inputValueShapeHashes),
    nodeKinds: Object.freeze(nodeKinds),
    nodes: Object.freeze(nodes),
    valueWorkUnits,
    verificationElapsedMicroseconds,
  });
}
