import type { Exercise, Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
  expectFactoryEffectRejection,
  factoryExercise,
  factoryRecordField,
} from "./prepared-purchase-factory-effects.fixtures.js";

export function registerPreparedFactoryEffectCases(): void {
  describe("prepared Purchase factory effects", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it.each([
      ["contract", (value: Exercise) => (value.contractId = "00other")],
      [
        "creation package",
        (value: Exercise) => (value.templateId!.packageId = "other"),
      ],
      [
        "interface package",
        (value: Exercise) => (value.interfaceId!.packageId = "other"),
      ],
      ["package name", (value: Exercise) => (value.packageName = "other")],
      ["actor", (value: Exercise) => (value.actingParties = ["other::1220"])],
      ["signatory", (value: Exercise) => (value.signatories = [])],
      ["stakeholder", (value: Exercise) => (value.stakeholders = [])],
      [
        "choice observer",
        (value: Exercise) => (value.choiceObservers = ["other::1220"]),
      ],
      ["choice", (value: Exercise) => (value.choiceId = "Other")],
      ["consuming flag", (value: Exercise) => (value.consuming = true)],
    ])("rejects a changed factory %s", async (_label, mutate) => {
      await expectFactoryEffectRejection((prepared) =>
        mutate(factoryExercise(prepared)),
      );
    });

    it.each([
      ["expected admin", "expectedAdmin", "party", "other::1220"],
      ["sender actor", "sender", "party", "other::1220"],
      ["receiver actor", "receiver", "party", "other::1220"],
      ["amount", "amount", "numeric", "9.0000000000"],
      ["requestedAt", "requestedAt", "timestamp", "1"],
      ["executeBefore", "executeBefore", "timestamp", "1"],
    ])(
      "rejects changed factory %s",
      async (_label, field, kind, replacement) => {
        await expectFactoryEffectRejection((prepared) => {
          const chosen = factoryExercise(prepared).chosenValue;
          const target =
            field === "expectedAdmin"
              ? factoryRecordField(chosen, field)
              : factoryRecordField(
                  factoryRecordField(chosen, "transfer"),
                  field,
                );
          target.sum = {
            oneofKind: kind,
            [kind]: replacement,
          } as Value["sum"];
        });
      },
    );

    it("rejects an unknown nested exercise", async () => {
      await expectFactoryEffectRejection((prepared) => {
        const replacement = structuredClone(
          prepared.transaction!.nodes.find(({ nodeId }) => nodeId === "101")!,
        );
        replacement.nodeId = "106";
        const wrapper = replacement.versionedNode;
        if (wrapper.oneofKind !== "v1") throw new Error("missing replacement");
        const node = wrapper.v1.nodeType;
        if (node.oneofKind !== "exercise") throw new Error("missing exercise");
        node.exercise.contractId = "00unknown-exercise";
        node.exercise.children = [];
        const index = prepared.transaction!.nodes.findIndex(
          ({ nodeId }) => nodeId === "106",
        );
        prepared.transaction!.nodes[index] = replacement;
      });
    });

    it("rejects a factory create outside the selected implementation package", async () => {
      await expectFactoryEffectRejection((prepared) => {
        const wrapper = prepared.transaction!.nodes.find(
          ({ nodeId }) => nodeId === "103",
        )!.versionedNode;
        if (wrapper.oneofKind !== "v1") throw new Error("missing create");
        const node = wrapper.v1.nodeType;
        if (node.oneofKind !== "create") throw new Error("missing create");
        node.create.templateId!.packageId = "other-package";
      });
    });
  });
}
