import type { Exercise, Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
  expectFactoryEffectRejection,
  factoryExercise,
  factoryRecordField,
  replacePreparedScalar,
} from "./prepared-purchase-factory-effects.fixtures.js";

function optionalValue(value: Value): Value | undefined {
  if (value.sum.oneofKind !== "optional") {
    throw new Error("test optional is absent");
  }
  return value.sum.optional.value;
}

function firstListValue(value: Value): Value {
  if (value.sum.oneofKind !== "list" || value.sum.list.elements.length === 0) {
    throw new Error("test list is absent");
  }
  return value.sum.list.elements[0]!;
}

function preapprovalExercise(
  prepared: Parameters<typeof factoryExercise>[0],
): Exercise {
  return factoryExercise(prepared, "108");
}

export function registerPreparedPreapprovalResultCases(): void {
  describe("prepared TransferPreapproval authenticated result", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it.each(["createdAmulets", "senderChangeAmulet"] as const)(
      "rejects changed preapproval result %s",
      async (field) => {
        await expectFactoryEffectRejection((prepared) => {
          const result = factoryRecordField(
            factoryRecordField(
              preapprovalExercise(prepared).exerciseResult,
              "result",
            ),
            field,
          );
          const value =
            field === "createdAmulets"
              ? firstListValue(result)
              : optionalValue(result)!;
          if (value.sum.oneofKind === "variant") {
            replacePreparedScalar(
              value.sum.variant.value!,
              "contractId",
              "00other",
            );
          } else {
            replacePreparedScalar(value, "contractId", "00other");
          }
        });
      },
    );
  });
}
