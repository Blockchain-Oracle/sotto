import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
  expectFactoryEffectRejection,
  factoryExercise,
  factoryRecordField,
  preparedCreate,
  replacePreparedScalar,
} from "./prepared-purchase-factory-effects.fixtures.js";

function setNumeric(
  value: ReturnType<typeof factoryRecordField>,
  replacement: string,
): void {
  replacePreparedScalar(value, "numeric", replacement);
}

function setDebitVector(
  prepared: Parameters<typeof preparedCreate>[0],
  input: string,
  debit: string,
  allowance: string,
): void {
  const inputContract = prepared.metadata!.inputContracts.find(
    (candidate) =>
      candidate.contract.oneofKind === "v1" &&
      candidate.contract.v1.contractId === "00holding-a",
  );
  if (inputContract?.contract.oneofKind !== "v1") {
    throw new Error("missing accounting input");
  }
  setNumeric(
    factoryRecordField(inputContract.contract.v1.argument, "amount"),
    input,
  );
  setNumeric(
    factoryRecordField(
      factoryExercise(prepared, "0").exerciseResult,
      "totalDebit",
    ),
    debit,
  );
  setNumeric(
    factoryRecordField(preparedCreate(prepared, "106").argument, "totalDebit"),
    debit,
  );
  setNumeric(
    factoryRecordField(
      preparedCreate(prepared, "107").argument,
      "remainingAllowance",
    ),
    allowance,
  );
}

export function registerPreparedAccountingEffectCases(): void {
  describe("prepared Holding debit fee and allowance effects", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it("rejects a conserved debit below principal", async () => {
      await expectFactoryEffectRejection((prepared) =>
        setDebitVector(
          prepared,
          "0.2990000000",
          "0.2490000000",
          "0.7510000000",
        ),
      );
    });

    it("rejects a conserved debit above the fee ceiling", async () => {
      await expectFactoryEffectRejection((prepared) =>
        setDebitVector(
          prepared,
          "0.3760000000",
          "0.3260000000",
          "0.6740000000",
        ),
      );
    });

    it("rejects a changed debit conservation equation", async () => {
      await expectFactoryEffectRejection((prepared) => {
        const inputContract = prepared.metadata!.inputContracts.find(
          (candidate) =>
            candidate.contract.oneofKind === "v1" &&
            candidate.contract.v1.contractId === "00holding-a",
        );
        if (inputContract?.contract.oneofKind !== "v1") {
          throw new Error("missing debit input");
        }
        setNumeric(
          factoryRecordField(inputContract.contract.v1.argument, "amount"),
          "0.3260000000",
        );
      });
    });
  });
}
