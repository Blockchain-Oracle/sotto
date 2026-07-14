import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
  expectFactoryEffectRejection,
  factoryExercise,
  factoryRecordField,
} from "./prepared-purchase-factory-effects.fixtures.js";

function addMetadataEntry(value: ReturnType<typeof factoryRecordField>): void {
  const values = factoryRecordField(value, "values");
  if (values.sum.oneofKind !== "textMap") {
    throw new Error("missing metadata map");
  }
  values.sum.textMap.entries.push({
    key: "forged",
    value: { sum: { oneofKind: "text", text: "value" } },
  });
}

export function registerPreparedFactoryResultCases(): void {
  describe("prepared Purchase factory values and results", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it("rejects changed factory registry context", async () => {
      await expectFactoryEffectRejection((prepared) => {
        const extraArgs = factoryRecordField(
          factoryExercise(prepared).chosenValue,
          "extraArgs",
        );
        const values = factoryRecordField(
          factoryRecordField(extraArgs, "context"),
          "values",
        );
        if (values.sum.oneofKind !== "textMap") {
          throw new Error("missing registry context map");
        }
        values.sum.textMap.entries.push({
          key: "forged",
          value: { sum: { oneofKind: "text", text: "value" } },
        });
      });
    });

    it.each([
      "TransferInstructionResult_Pending",
      "TransferInstructionResult_Failed",
      "TransferInstructionResult_Unknown",
    ])("rejects factory result %s", async (constructor) => {
      await expectFactoryEffectRejection((prepared) => {
        const output = factoryRecordField(
          factoryExercise(prepared).exerciseResult,
          "output",
        );
        if (output.sum.oneofKind !== "variant") {
          throw new Error("missing factory result variant");
        }
        output.sum.variant.constructor = constructor;
      });
    });

    it.each([
      [
        "transfer",
        (prepared: Parameters<typeof factoryExercise>[0]) =>
          factoryRecordField(
            factoryRecordField(
              factoryExercise(prepared).chosenValue,
              "transfer",
            ),
            "meta",
          ),
      ],
      [
        "extraArgs",
        (prepared: Parameters<typeof factoryExercise>[0]) =>
          factoryRecordField(
            factoryRecordField(
              factoryExercise(prepared).chosenValue,
              "extraArgs",
            ),
            "meta",
          ),
      ],
      [
        "result",
        (prepared: Parameters<typeof factoryExercise>[0]) =>
          factoryRecordField(factoryExercise(prepared).exerciseResult, "meta"),
      ],
    ])("rejects nonempty %s metadata", async (_label, select) => {
      await expectFactoryEffectRejection((prepared) =>
        addMetadataEntry(select(prepared)),
      );
    });
  });
}
