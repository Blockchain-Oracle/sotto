import type { Create, Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
  expectFactoryEffectRejection,
  factoryRecordField,
  preparedCreate,
  replacePreparedScalar,
} from "./prepared-purchase-factory-effects.fixtures.js";

function context(prepared: Parameters<typeof preparedCreate>[0]): Create {
  return preparedCreate(prepared, "106");
}

type ScalarMutation = readonly [
  label: string,
  kind: Parameters<typeof replacePreparedScalar>[1],
  replacement: string | boolean,
];

const contextMutations: readonly ScalarMutation[] = [
  ["payer", "party", "other::1220"],
  ["agent", "party", "other::1220"],
  ["provider", "party", "other::1220"],
  ["attemptId", "text", "sha256:other"],
  ["purchaseCommitment", "text", "sha256:other"],
  ["requestCommitment", "text", "sha256:other"],
  ["challengeId", "text", "sha256:other"],
  ["resourceHash", "text", "sha256:other"],
  ["capabilityRevision", "int64", "9"],
  ["amount", "numeric", "9.0000000000"],
  ["totalDebit", "numeric", "9.0000000000"],
];

function mutateField(
  argument: Value | undefined,
  [label, kind, replacement]: ScalarMutation,
): void {
  replacePreparedScalar(factoryRecordField(argument, label), kind, replacement);
}

export function registerPreparedContextEffectCases(): void {
  describe("prepared PurchaseContext effects", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it.each(contextMutations)(
      "rejects changed context %s",
      async (...mutation) => {
        await expectFactoryEffectRejection((prepared) =>
          mutateField(context(prepared).argument, mutation),
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
    ])("rejects changed context %s", async (_label, mutate) => {
      await expectFactoryEffectRejection((prepared) =>
        mutate(context(prepared)),
      );
    });
  });
}
