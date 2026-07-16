import type { Create } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBoundedPurchasePrepareRequest } from "../src/index.js";
import { validatePreparedHoldingValue } from "../src/prepared-purchase-holding-value.js";
import {
  expectFactoryEffectRejection,
  factoryRecordField,
  preparedCreate,
  replacePreparedScalar,
} from "./prepared-purchase-factory-effects.fixtures.js";
import { fixtureIdentifier } from "./prepared-purchase-value.fixtures.js";
import { validPreparedPurchase } from "./prepared-purchase.fixtures.js";
import { purchaseCommandInputs } from "./transfer-factory-observation.fixtures.js";

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

function amountValue(create: Create) {
  const amount = factoryRecordField(create.argument, "amount");
  return amount.sum.oneofKind === "record"
    ? factoryRecordField(amount, "initialAmount")
    : amount;
}

function templateId(create: Create): string {
  const value = create.templateId;
  if (value === undefined) throw new Error("missing Holding template");
  return `${value.packageId}:${value.moduleName}:${value.entityName}`;
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
          const argument = holding(prepared, location).argument;
          replacePreparedScalar(
            factoryRecordField(argument, "dso"),
            "party",
            "other::1220",
          );
        });
      },
    );

    it.each(["input", "receiver", "change"] as const)(
      "rejects changed %s Holding amount",
      async (location) => {
        await expectFactoryEffectRejection((prepared) => {
          replacePreparedScalar(
            amountValue(holding(prepared, location)),
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

    it("rejects an input Holding argument outside authenticated packages", async () => {
      await expectFactoryEffectRejection((prepared) => {
        const argument = inputHolding(prepared).argument?.sum;
        if (argument?.oneofKind !== "record") {
          throw new Error("missing input Holding argument");
        }
        argument.record.recordId = fixtureIdentifier(
          `${"f".repeat(64)}:Splice.Amulet:Amulet`,
        );
      });
    });

    it("accepts the minimum positive ExpiringAmount initial amount", async () => {
      const { intent, holdings, packageSelection, registry } =
        await purchaseCommandInputs();
      const request = buildBoundedPurchasePrepareRequest(
        intent,
        holdings,
        registry,
        packageSelection,
      );
      const prepared = validPreparedPurchase(intent, request);
      const create = inputHolding(prepared);
      replacePreparedScalar(amountValue(create), "numeric", "0.0000000001");

      expect(
        validatePreparedHoldingValue(
          create,
          templateId(create),
          intent.challenge.payerParty,
          intent,
          "boundary Holding",
        ),
      ).toBe(1n);
    });

    it.each(["0.0000000000", "-0.0000000001"])(
      "rejects nonpositive ExpiringAmount initial amount %s",
      async (initialAmount) => {
        const { intent, holdings, packageSelection, registry } =
          await purchaseCommandInputs();
        const request = buildBoundedPurchasePrepareRequest(
          intent,
          holdings,
          registry,
          packageSelection,
        );
        const prepared = validPreparedPurchase(intent, request);
        const create = inputHolding(prepared);
        replacePreparedScalar(amountValue(create), "numeric", initialAmount);

        expect(() =>
          validatePreparedHoldingValue(
            create,
            templateId(create),
            intent.challenge.payerParty,
            intent,
            "boundary Holding",
          ),
        ).toThrow(/initial amount.*positive/iu);
      },
    );
  });
}
