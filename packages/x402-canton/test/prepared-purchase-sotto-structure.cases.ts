import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
  expectFactoryEffectRejection,
  factoryExercise,
  factoryRecordField,
  replacePreparedScalar,
} from "./prepared-purchase-factory-effects.fixtures.js";

function removeCreate(
  prepared: Parameters<typeof factoryExercise>[0],
  nodeId: string,
): void {
  const transaction = prepared.transaction!;
  factoryExercise(prepared, "0").children = factoryExercise(
    prepared,
    "0",
  ).children.filter((value) => value !== nodeId);
  transaction.nodes = transaction.nodes.filter(
    (node) => node.nodeId !== nodeId,
  );
  transaction.nodeSeeds = transaction.nodeSeeds.filter(
    (seed) => seed.nodeId !== Number(nodeId),
  );
}

function duplicateCreate(
  prepared: Parameters<typeof factoryExercise>[0],
  sourceId: string,
): void {
  const transaction = prepared.transaction!;
  const duplicate = structuredClone(
    transaction.nodes.find(({ nodeId }) => nodeId === sourceId)!,
  );
  duplicate.nodeId = "113";
  const wrapper = duplicate.versionedNode;
  if (wrapper.oneofKind !== "v1") throw new Error("missing create clone");
  const node = wrapper.v1.nodeType;
  if (node.oneofKind !== "create") throw new Error("clone is not a create");
  node.create.contractId = "00duplicate-sotto-create";
  transaction.nodes.push(duplicate);
  factoryExercise(prepared, "0").children.push("113");
  transaction.nodeSeeds.push({
    nodeId: 113,
    seed: new Uint8Array(32).fill(8),
  });
}

export function registerPreparedSottoStructureCases(): void {
  describe("prepared capability and context structure", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it.each([
      ["capability", "107"],
      ["context", "106"],
    ])("rejects missing %s create", async (_label, nodeId) => {
      await expectFactoryEffectRejection((prepared) =>
        removeCreate(prepared, nodeId),
      );
    });

    it.each([
      ["capability", "107"],
      ["context", "106"],
    ])("rejects duplicate %s create", async (_label, nodeId) => {
      await expectFactoryEffectRejection((prepared) =>
        duplicateCreate(prepared, nodeId),
      );
    });

    it.each([
      ["capability reference", "capabilityCid", "00other"],
      ["context reference", "contextCid", "00other"],
      ["total debit", "totalDebit", "9.0000000000"],
    ])("rejects changed root %s", async (_label, field, replacement) => {
      await expectFactoryEffectRejection((prepared) => {
        const value = factoryRecordField(
          factoryExercise(prepared, "0").exerciseResult,
          field,
        );
        replacePreparedScalar(
          value,
          field === "totalDebit" ? "numeric" : "contractId",
          replacement,
        );
      });
    });

    it("rejects changed root receiver holdings", async () => {
      await expectFactoryEffectRejection((prepared) => {
        const value = factoryRecordField(
          factoryExercise(prepared, "0").exerciseResult,
          "receiverHoldingCids",
        );
        if (value.sum.oneofKind !== "list")
          throw new Error("missing receivers");
        value.sum.list.elements[0] = {
          sum: { oneofKind: "contractId", contractId: "00other" },
        };
      });
    });
  });
}
