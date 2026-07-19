import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedPurchasePrepareRequest,
  createPreparedPurchaseObserver,
} from "../src/index.js";
import {
  preparedPurchaseBytes,
  type PreparedPurchaseFixture,
} from "./prepared-purchase.fixtures.js";
import { purchaseCommandInputs } from "./transfer-factory-observation.fixtures.js";

const preparedHash = Buffer.alloc(32, 7).toString("base64");

function response(transaction: Uint8Array): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      preparedTransaction: Buffer.from(transaction).toString("base64"),
      preparedTransactionHash: preparedHash,
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      hashingDetails: null,
      costEstimation: null,
    }),
  );
}

function rootExercise(prepared: PreparedPurchaseFixture) {
  const wrapper = prepared.transaction!.nodes[0]!.versionedNode;
  if (wrapper.oneofKind !== "v1") throw new Error("missing test root");
  const node = wrapper.v1.nodeType;
  if (node.oneofKind !== "exercise") throw new Error("missing exercise");
  return node.exercise;
}

function addExercise(
  prepared: PreparedPurchaseFixture,
  nodeId: string,
  children: readonly string[] = [],
): void {
  const node = structuredClone(prepared.transaction!.nodes[0]!);
  node.nodeId = nodeId;
  const wrapper = node.versionedNode;
  if (wrapper.oneofKind !== "v1") throw new Error("missing cloned node");
  const value = wrapper.v1.nodeType;
  if (value.oneofKind !== "exercise") throw new Error("missing clone exercise");
  value.exercise.contractId = `00nested-${nodeId}`;
  value.exercise.choiceId = "Nested";
  value.exercise.children = [...children];
  prepared.transaction!.nodes.push(node);
  prepared.transaction!.nodeSeeds.push({
    nodeId: Number(nodeId),
    seed: new Uint8Array(32).fill(7),
  });
}

async function expectGraphRejection(
  mutate: (prepared: PreparedPurchaseFixture) => void,
): Promise<void> {
  const { intent, holdings, packageSelection, registry } =
    await purchaseCommandInputs();
  const request = buildBoundedPurchasePrepareRequest(
    intent,
    holdings,
    registry,
    packageSelection,
  );
  const transaction = preparedPurchaseBytes(intent, request, mutate);
  const observe = createPreparedPurchaseObserver(async () =>
    response(transaction),
  );
  await expect(observe(request)).rejects.toThrow();
}

describe("prepared Purchase graph integrity", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [
      "missing child",
      (prepared: PreparedPurchaseFixture) => {
        rootExercise(prepared).children = ["1"];
      },
    ],
    [
      "duplicate child",
      (prepared: PreparedPurchaseFixture) => {
        rootExercise(prepared).children = ["1", "1"];
      },
    ],
    [
      "orphan node",
      (prepared: PreparedPurchaseFixture) => addExercise(prepared, "1"),
    ],
    [
      "cycle",
      (prepared: PreparedPurchaseFixture) => {
        rootExercise(prepared).children = ["1"];
        addExercise(prepared, "1", ["0"]);
      },
    ],
    [
      "shared child",
      (prepared: PreparedPurchaseFixture) => {
        rootExercise(prepared).children = ["1", "2"];
        addExercise(prepared, "1", ["3"]);
        addExercise(prepared, "2", ["3"]);
        addExercise(prepared, "3");
      },
    ],
    [
      "noncanonical child ID",
      (prepared: PreparedPurchaseFixture) => {
        rootExercise(prepared).children = ["01"];
        addExercise(prepared, "01");
      },
    ],
  ])("rejects a %s", async (_label, mutate) => {
    await expectGraphRejection(mutate);
  });

  it("rejects a graph deeper than 64 nodes", async () => {
    await expectGraphRejection((prepared) => {
      for (let index = 0; index < 64; index++) {
        const parent = index.toString();
        const child = (index + 1).toString();
        if (index === 0) rootExercise(prepared).children = [child];
        else {
          const node = prepared.transaction!.nodes.find(
            ({ nodeId }) => nodeId === parent,
          )!;
          const wrapper = node.versionedNode;
          if (wrapper.oneofKind !== "v1") throw new Error("missing chain");
          const value = wrapper.v1.nodeType;
          if (value.oneofKind !== "exercise")
            throw new Error("missing chain exercise");
          value.exercise.children = [child];
        }
        addExercise(prepared, child);
      }
    });
  });

  it.each([
    [
      "duplicate seed",
      (prepared: PreparedPurchaseFixture) => {
        prepared.transaction!.nodeSeeds.push(
          structuredClone(prepared.transaction!.nodeSeeds[0]!),
        );
      },
    ],
    [
      "extra seed",
      (prepared: PreparedPurchaseFixture) => {
        prepared.transaction!.nodeSeeds.push({
          nodeId: 1,
          seed: new Uint8Array(32).fill(7),
        });
      },
    ],
    [
      "short seed",
      (prepared: PreparedPurchaseFixture) => {
        prepared.transaction!.nodeSeeds[0]!.seed = new Uint8Array(31);
      },
    ],
  ])("rejects a %s", async (_label, mutate) => {
    await expectGraphRejection(mutate);
  });
});
