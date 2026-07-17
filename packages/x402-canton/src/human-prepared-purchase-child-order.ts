import type { HumanPreparedTransferEffects } from "./human-prepared-purchase-transfer-effects.js";
import type { PreparedPurchaseGraph } from "./prepared-purchase-graph-types.js";

function exactEffectId(
  graph: PreparedPurchaseGraph,
  children: readonly string[],
  contractId: string,
  kind: "archive" | "create",
): string {
  const matches = children.filter((nodeId) => {
    const node = graph.nodes.get(nodeId);
    return kind === "create"
      ? node?.kind === "create" && node.create.contractId === contractId
      : node?.kind === "exercise" &&
          node.exercise.choiceId === "Archive" &&
          node.exercise.contractId === contractId;
  });
  if (matches.length !== 1) {
    throw new Error(`prepared human ${kind} order identity is ambiguous`);
  }
  return matches[0]!;
}

export function validateHumanPreparedChildOrder(
  graph: PreparedPurchaseGraph,
  transfer: HumanPreparedTransferEffects,
  inputHoldingCids: readonly string[],
  eventIds: readonly string[],
): void {
  const children = transfer.preapproval.children;
  const effectIds = (
    contractIds: readonly string[],
    kind: "archive" | "create",
  ) =>
    contractIds.map((contractId) =>
      exactEffectId(graph, children, contractId, kind),
    );
  const [configFetch, featuredFetch, ...holdingFetches] =
    transfer.innerFetchIds;
  const archives = effectIds(inputHoldingCids, "archive");
  if (
    configFetch === undefined ||
    featuredFetch === undefined ||
    holdingFetches.length !== archives.length
  ) {
    throw new Error("prepared human input effect order is incomplete");
  }
  const expected = [
    configFetch,
    featuredFetch,
    ...holdingFetches.flatMap((fetchId, index) => [fetchId, archives[index]!]),
    ...effectIds(transfer.receiverHoldingCids, "create"),
    ...effectIds(transfer.senderChangeCids, "create"),
    ...eventIds,
  ];
  if (JSON.stringify(children) !== JSON.stringify(expected)) {
    throw new Error("prepared human child effect order does not match");
  }
}
