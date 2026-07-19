import type {
  Create,
  Exercise,
  Value,
} from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { EXTERNAL_PURCHASE_CONTEXT } from "./transfer-factory-observation.fixtures.js";
import {
  expectFactoryEffectRejection,
  factoryRecordField,
  replacePreparedScalar,
} from "./prepared-purchase-factory-effects.fixtures.js";
import type { PreparedPurchaseFixture } from "./prepared-purchase.fixtures.js";
import {
  fixtureIdentifier,
  fixtureScalar,
} from "./prepared-purchase-value.fixtures.js";

function preapprovalExercise(prepared: PreparedPurchaseFixture): Exercise {
  const wrapper = prepared.transaction!.nodes.find(
    ({ nodeId }) => nodeId === "108",
  )?.versionedNode;
  if (
    wrapper?.oneofKind !== "v1" ||
    wrapper.v1.nodeType.oneofKind !== "exercise"
  ) {
    throw new Error("missing preapproval exercise");
  }
  return wrapper.v1.nodeType.exercise;
}

function preapprovalInput(prepared: PreparedPurchaseFixture): Create {
  const input = prepared.metadata!.inputContracts.find(
    ({ contract }) =>
      contract.oneofKind === "v1" &&
      contract.v1.contractId === EXTERNAL_PURCHASE_CONTEXT.transferPreapproval,
  )?.contract;
  if (input?.oneofKind !== "v1") {
    throw new Error("missing preapproval metadata input");
  }
  return input.v1;
}

function replaceThirdParty(authority: {
  signatories: string[];
  stakeholders: string[];
}): void {
  authority.signatories[2] = "unrelated::1220thirdparty";
  authority.stakeholders[2] = "unrelated::1220thirdparty";
}

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

export function registerPreparedPreapprovalEffectCases(): void {
  describe("prepared TransferPreapproval authenticated authority", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it("rejects a changed exercise third-party authority", async () => {
      await expectFactoryEffectRejection((prepared) => {
        replaceThirdParty(preapprovalExercise(prepared));
      });
    });

    it("rejects a changed metadata third-party authority", async () => {
      await expectFactoryEffectRejection((prepared) => {
        replaceThirdParty(preapprovalInput(prepared));
      });
    });

    it.each([
      [
        "contract",
        (value: Exercise): void => void (value.contractId = "00other"),
      ],
      [
        "template",
        (value: Exercise): void =>
          void (value.templateId = fixtureIdentifier(
            `${"f".repeat(64)}:Splice.AmuletRules:TransferPreapproval`,
          )),
      ],
      ["choice", (value: Exercise): void => void (value.choiceId = "Other")],
      ["consuming", (value: Exercise): void => void (value.consuming = true)],
      [
        "acting party",
        (value: Exercise): void => void (value.actingParties = ["other::1220"]),
      ],
      [
        "choice observer",
        (value: Exercise): void =>
          void (value.choiceObservers = ["other::1220"]),
      ],
    ] as const)("rejects changed preapproval %s", async (_label, mutate) => {
      await expectFactoryEffectRejection((prepared) =>
        mutate(preapprovalExercise(prepared)),
      );
    });

    it.each([
      [
        "config state",
        (choice: Value) =>
          replacePreparedScalar(
            factoryRecordField(
              factoryRecordField(choice, "context"),
              "externalPartyConfigState",
            ),
            "contractId",
            "00other",
          ),
      ],
      [
        "featured app right",
        (choice: Value) =>
          replacePreparedScalar(
            optionalValue(
              factoryRecordField(
                factoryRecordField(choice, "context"),
                "featuredAppRight",
              ),
            )!,
            "contractId",
            "00other",
          ),
      ],
      [
        "input",
        (choice: Value) => {
          const input = firstListValue(factoryRecordField(choice, "inputs"));
          if (
            input.sum.oneofKind !== "variant" ||
            input.sum.variant.value === undefined
          ) {
            throw new Error("test transfer input is absent");
          }
          replacePreparedScalar(
            input.sum.variant.value,
            "contractId",
            "00other",
          );
        },
      ],
      [
        "amount",
        (choice: Value) =>
          replacePreparedScalar(
            factoryRecordField(choice, "amount"),
            "numeric",
            "9.0000000000",
          ),
      ],
      [
        "sender",
        (choice: Value) =>
          replacePreparedScalar(
            factoryRecordField(choice, "sender"),
            "party",
            "other::1220",
          ),
      ],
      [
        "description",
        (choice: Value) => {
          const description = factoryRecordField(choice, "description");
          if (description.sum.oneofKind !== "optional")
            throw new Error("test description is absent");
          description.sum.optional.value = fixtureScalar("text", "hidden");
        },
      ],
    ] as const)(
      "rejects changed preapproval choice %s",
      async (_label, mutate) => {
        await expectFactoryEffectRejection((prepared) =>
          mutate(preapprovalExercise(prepared).chosenValue!),
        );
      },
    );
  });
}
