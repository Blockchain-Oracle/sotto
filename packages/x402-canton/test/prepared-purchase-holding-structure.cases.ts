import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
  expectFactoryEffectRejection,
  factoryExercise,
} from "./prepared-purchase-factory-effects.fixtures.js";
import type { preparedCreate } from "./prepared-purchase-factory-effects.fixtures.js";

function appendCreate(
  prepared: Parameters<typeof preparedCreate>[0],
  parentId: "0" | "108",
): void {
  const transaction = prepared.transaction!;
  const duplicate = structuredClone(
    transaction.nodes.find(({ nodeId }) => nodeId === "103")!,
  );
  duplicate.nodeId = "113";
  const wrapper = duplicate.versionedNode;
  if (wrapper.oneofKind !== "v1") throw new Error("missing Holding clone");
  const node = wrapper.v1.nodeType;
  if (node.oneofKind !== "create") throw new Error("clone is not a create");
  node.create.contractId = "00unclassified-holding";
  transaction.nodes.push(duplicate);
  factoryExercise(prepared, parentId).children.push("113");
  transaction.nodeSeeds.push({
    nodeId: 113,
    seed: new Uint8Array(32).fill(8),
  });
}

function reparentFactoryCreate(
  prepared: Parameters<typeof preparedCreate>[0],
  nodeId: "103" | "104",
): void {
  const factory = factoryExercise(prepared, "108");
  factory.children = factory.children.filter((child) => child !== nodeId);
  factoryExercise(prepared, "0").children.push(nodeId);
}

export function registerPreparedHoldingStructureCases(): void {
  describe("prepared Holding linkage and unclassified effects", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it("rejects a missing sender-change Holding fetch", async () => {
      await expectFactoryEffectRejection((prepared) => {
        factoryExercise(prepared, "0").children = factoryExercise(
          prepared,
          "0",
        ).children.filter((nodeId) => nodeId !== "105");
        prepared.transaction!.nodes = prepared.transaction!.nodes.filter(
          ({ nodeId }) => nodeId !== "105",
        );
      });
    });

    it("rejects an unclassified factory Holding create", async () => {
      await expectFactoryEffectRejection((prepared) =>
        appendCreate(prepared, "108"),
      );
    });

    it("rejects an unclassified root Holding create", async () => {
      await expectFactoryEffectRejection((prepared) =>
        appendCreate(prepared, "0"),
      );
    });

    it.each([
      ["receiver", "103"],
      ["change", "104"],
    ] as const)(
      "rejects a %s Holding outside the factory",
      async (_label, nodeId) => {
        await expectFactoryEffectRejection((prepared) =>
          reparentFactoryCreate(prepared, nodeId),
        );
      },
    );

    it("rejects an unclassified metadata input contract", async () => {
      await expectFactoryEffectRejection((prepared) => {
        const duplicate = structuredClone(
          prepared.metadata!.inputContracts[2]!,
        );
        if (duplicate.contract.oneofKind !== "v1") {
          throw new Error("missing input clone");
        }
        duplicate.contract.v1.contractId = "00unclassified-input";
        prepared.metadata!.inputContracts.push(duplicate);
      });
    });

    it("rejects changed input Holding fetch linkage", async () => {
      await expectFactoryEffectRejection((prepared) => {
        const wrapper = prepared.transaction!.nodes.find(
          ({ nodeId }) => nodeId === "100",
        )!.versionedNode;
        if (wrapper.oneofKind !== "v1") throw new Error("missing input fetch");
        const node = wrapper.v1.nodeType;
        if (node.oneofKind !== "fetch") throw new Error("node is not a fetch");
        node.fetch.contractId = "00other-holding";
      });
    });
  });
}
