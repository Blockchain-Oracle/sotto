import type { Create } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
  expectFactoryEffectRejection,
  factoryRecordField,
  replacePreparedScalar,
} from "./prepared-purchase-factory-effects.fixtures.js";
import type { PreparedPurchaseFixture } from "./prepared-purchase.fixtures.js";

function metadataInput(
  prepared: PreparedPurchaseFixture,
  contractId: string,
): Create {
  const input = prepared.metadata!.inputContracts.find(
    (candidate) =>
      candidate.contract.oneofKind === "v1" &&
      candidate.contract.v1.contractId === contractId,
  );
  if (input?.contract.oneofKind !== "v1") {
    throw new Error(`missing metadata input ${contractId}`);
  }
  return input.contract.v1;
}

describe("prepared Purchase metadata input linkage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
  });

  afterEach(() => vi.useRealTimers());

  it("rejects changed source capability allowance", async () => {
    await expectFactoryEffectRejection((prepared) => {
      replacePreparedScalar(
        factoryRecordField(
          metadataInput(prepared, "00capability7").argument,
          "remainingAllowance",
        ),
        "numeric",
        "0.9999999999",
      );
    });
  });

  it("rejects changed metadata factory package linkage", async () => {
    await expectFactoryEffectRejection((prepared) => {
      metadataInput(prepared, "00tokenfactory7").templateId!.packageId = "x";
    });
  });

  it("rejects changed metadata factory authority", async () => {
    await expectFactoryEffectRejection((prepared) => {
      metadataInput(prepared, "00tokenfactory7").signatories = [];
    });
  });
});
