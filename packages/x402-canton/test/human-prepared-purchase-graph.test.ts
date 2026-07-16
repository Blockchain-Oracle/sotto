import type { DamlTransaction } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateHumanPreparedPurchaseGraph } from "../src/human-prepared-purchase-graph.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanPreparedRootExercise,
  humanPreparedRootInputs,
  type HumanPreparedRootInputs,
} from "./human-prepared-purchase-root.fixtures.js";

function rootOnlyTransaction(input: HumanPreparedRootInputs): DamlTransaction {
  const exercise = humanPreparedRootExercise(input);
  exercise.children = [];
  return {
    version: "2.1",
    roots: ["0"],
    nodes: [
      {
        nodeId: "0",
        versionedNode: {
          oneofKind: "v1",
          v1: { nodeType: { oneofKind: "exercise", exercise } },
        },
      },
    ],
    nodeSeeds: [{ nodeId: 0, seed: new Uint8Array(32).fill(7) }],
  };
}

describe("human prepared transaction graph", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("validates one canonical payer-root graph before effect checks", async () => {
    const input = await humanPreparedRootInputs();
    const budget = { items: 0 };
    const graph = validateHumanPreparedPurchaseGraph(
      rootOnlyTransaction(input),
      input.intent,
      input.request,
      budget,
    );
    expect(graph.rootId).toBe("0");
    expect(graph.nodes.size).toBe(1);
    expect(budget.items).toBeGreaterThan(0);
  });

  it.each([
    [
      "an extra root",
      (transaction: DamlTransaction) => transaction.roots.push("0"),
    ],
    [
      "a rollback root",
      (transaction: DamlTransaction) => {
        transaction.nodes[0]!.versionedNode = {
          oneofKind: "v1",
          v1: {
            nodeType: { oneofKind: "rollback", rollback: { children: [] } },
          },
        };
      },
    ],
    [
      "a missing seed",
      (transaction: DamlTransaction) => {
        transaction.nodeSeeds = [];
      },
    ],
  ])("rejects %s", async (_label, mutate) => {
    const input = await humanPreparedRootInputs();
    const transaction = rootOnlyTransaction(input);
    mutate(transaction);
    expect(() =>
      validateHumanPreparedPurchaseGraph(
        transaction,
        input.intent,
        input.request,
        { items: 0 },
      ),
    ).toThrow(/prepared/iu);
  });
});
