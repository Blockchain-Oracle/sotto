import type { Create, Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
  expectFactoryEffectRejection,
  factoryRecordField,
  preparedCreate,
  replacePreparedScalar,
} from "./prepared-purchase-factory-effects.fixtures.js";

function capability(prepared: Parameters<typeof preparedCreate>[0]): Create {
  return preparedCreate(prepared, "107");
}

type ScalarMutation = readonly [
  label: string,
  kind: Parameters<typeof replacePreparedScalar>[1],
  replacement: string | boolean,
];

const capabilityMutations: readonly ScalarMutation[] = [
  ["payer", "party", "other::1220"],
  ["agent", "party", "other::1220"],
  ["resourceBindingVersion", "text", "other"],
  ["allowedResourceHash", "text", "sha256:other"],
  ["allowedRecipient", "party", "other::1220"],
  ["perCallLimit", "numeric", "9.0000000000"],
  ["remainingAllowance", "numeric", "0.7249999999"],
  ["maximumTotalDebit", "numeric", "9.0000000000"],
  ["expiresAt", "timestamp", "1"],
  ["revision", "int64", "9"],
  ["paused", "bool", true],
  ["transferFactoryCid", "contractId", "00other"],
  ["expectedAdmin", "party", "other::1220"],
];

function mutateField(
  argument: Value | undefined,
  [label, kind, replacement]: ScalarMutation,
): void {
  replacePreparedScalar(factoryRecordField(argument, label), kind, replacement);
}

export function registerPreparedCapabilityEffectCases(): void {
  describe("prepared replacement capability effects", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it.each(capabilityMutations)(
      "rejects changed capability %s",
      async (...mutation) => {
        await expectFactoryEffectRejection((prepared) =>
          mutateField(capability(prepared).argument, mutation),
        );
      },
    );

    it.each([
      [
        "template package",
        (value: Create) => (value.templateId!.packageId = "x"),
      ],
      [
        "template module",
        (value: Create) => (value.templateId!.moduleName = "X"),
      ],
      [
        "template entity",
        (value: Create) => (value.templateId!.entityName = "X"),
      ],
      ["package name", (value: Create) => (value.packageName = "x")],
      ["signatory", (value: Create) => (value.signatories = [])],
      ["stakeholders", (value: Create) => (value.stakeholders = [])],
    ])("rejects changed capability %s", async (_label, mutate) => {
      await expectFactoryEffectRejection((prepared) =>
        mutate(capability(prepared)),
      );
    });

    it("rejects changed capability instrument", async () => {
      await expectFactoryEffectRejection((prepared) => {
        const instrument = factoryRecordField(
          capability(prepared).argument,
          "instrumentId",
        );
        replacePreparedScalar(
          factoryRecordField(instrument, "id"),
          "text",
          "Other",
        );
      });
    });
  });
}
