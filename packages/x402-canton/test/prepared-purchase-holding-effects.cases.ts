import type { Create } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
  expectFactoryEffectRejection,
  factoryRecordField,
  preparedCreate,
  replacePreparedScalar,
} from "./prepared-purchase-factory-effects.fixtures.js";

function inputHolding(prepared: Parameters<typeof preparedCreate>[0]): Create {
  const input = prepared.metadata!.inputContracts.find(
    (candidate) =>
      candidate.contract.oneofKind === "v1" &&
      candidate.contract.v1.contractId === "00holding-a",
  );
  if (input?.contract.oneofKind !== "v1") {
    throw new Error("missing input Holding");
  }
  return input.contract.v1;
}

function holding(
  prepared: Parameters<typeof preparedCreate>[0],
  location: "input" | "receiver" | "change",
): Create {
  return location === "input"
    ? inputHolding(prepared)
    : preparedCreate(prepared, location === "receiver" ? "103" : "104");
}

export function registerPreparedHoldingEffectCases(): void {
  describe("prepared Holding owner instrument and amount effects", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it.each(["input", "receiver", "change"] as const)(
      "rejects changed %s Holding owner",
      async (location) => {
        await expectFactoryEffectRejection((prepared) => {
          replacePreparedScalar(
            factoryRecordField(holding(prepared, location).argument, "owner"),
            "party",
            "other::1220",
          );
        });
      },
    );

    it.each(["input", "receiver", "change"] as const)(
      "rejects changed %s Holding instrument",
      async (location) => {
        await expectFactoryEffectRejection((prepared) => {
          const instrument = factoryRecordField(
            holding(prepared, location).argument,
            "instrumentId",
          );
          replacePreparedScalar(
            factoryRecordField(instrument, "id"),
            "text",
            "Other",
          );
        });
      },
    );

    it.each(["input", "receiver", "change"] as const)(
      "rejects changed %s Holding amount",
      async (location) => {
        await expectFactoryEffectRejection((prepared) => {
          replacePreparedScalar(
            factoryRecordField(holding(prepared, location).argument, "amount"),
            "numeric",
            "9.0000000000",
          );
        });
      },
    );

    it.each([
      ["receiver", "103"],
      ["change", "104"],
    ])("rejects changed %s Holding linkage", async (_label, nodeId) => {
      await expectFactoryEffectRejection((prepared) => {
        preparedCreate(prepared, nodeId).contractId = "00other-holding";
      });
    });
  });
}
