import type { Exercise, Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
  expectFactoryEffectRejection,
  factoryExercise,
  factoryRecordField,
  replacePreparedScalar,
} from "./prepared-purchase-factory-effects.fixtures.js";
import {
  fixtureIdentifier,
  fixtureScalar,
} from "./prepared-purchase-value.fixtures.js";
import type { PreparedPurchaseFixture } from "./prepared-purchase.fixtures.js";
import { PAYER } from "./purchase-commitment.fixtures.js";

function firstListValue(value: Value): Value {
  if (value.sum.oneofKind !== "list" || value.sum.list.elements.length === 0) {
    throw new Error("test list is absent");
  }
  return value.sum.list.elements[0]!;
}

function eventChoice(prepared: PreparedPurchaseFixture, nodeId = "111"): Value {
  const value = factoryExercise(prepared, nodeId).chosenValue;
  if (value === undefined) throw new Error("test event choice is absent");
  return value;
}

function accountOwner(account: Value): Value {
  const owner = factoryRecordField(account, "owner");
  if (
    owner.sum.oneofKind !== "optional" ||
    owner.sum.optional.value === undefined
  ) {
    throw new Error("test account owner is absent");
  }
  return owner.sum.optional.value;
}

function firstLeg(choice: Value): Value {
  return firstListValue(factoryRecordField(choice, "transferLegSides"));
}

function removeEvent(prepared: PreparedPurchaseFixture, nodeId: string): void {
  const transfer = factoryExercise(prepared, "108");
  transfer.children = transfer.children.filter((child) => child !== nodeId);
  prepared.transaction!.nodes = prepared.transaction!.nodes.filter(
    (node) => node.nodeId !== nodeId,
  );
  prepared.transaction!.nodeSeeds = prepared.transaction!.nodeSeeds.filter(
    (seed) => seed.nodeId !== Number(nodeId),
  );
}

export function registerPreparedEventLogEffectCases(): void {
  describe("prepared external EventLog effects", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it("rejects a missing account event", async () => {
      await expectFactoryEffectRejection((prepared) =>
        removeEvent(prepared, "111"),
      );
    });

    it("rejects duplicate account events", async () => {
      await expectFactoryEffectRejection((prepared) => {
        const exercise = factoryExercise(prepared, "112");
        replacePreparedScalar(
          accountOwner(factoryRecordField(exercise.chosenValue, "account")),
          "party",
          PAYER,
        );
        exercise.choiceObservers = [PAYER];
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
            `${"f".repeat(64)}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
          )),
      ],
      [
        "interface",
        (value: Exercise): void =>
          void (value.interfaceId = fixtureIdentifier(
            `${"f".repeat(64)}:Splice.Api.Token.TransferEventsV2:EventLog`,
          )),
      ],
      ["consuming", (value: Exercise): void => void (value.consuming = true)],
      [
        "acting",
        (value: Exercise): void => void (value.actingParties = [PAYER]),
      ],
      [
        "signatory",
        (value: Exercise): void => void (value.signatories = [PAYER]),
      ],
      [
        "stakeholder",
        (value: Exercise): void => void (value.stakeholders = [PAYER]),
      ],
      [
        "observer",
        (value: Exercise): void => void (value.choiceObservers = []),
      ],
    ] as const)("rejects changed EventLog %s", async (_label, mutate) => {
      await expectFactoryEffectRejection((prepared) =>
        mutate(factoryExercise(prepared, "111")),
      );
    });

    it.each([
      [
        "admin",
        (choice: Value) =>
          replacePreparedScalar(
            factoryRecordField(choice, "admin"),
            "party",
            PAYER,
          ),
      ],
      [
        "account",
        (choice: Value) =>
          replacePreparedScalar(
            accountOwner(factoryRecordField(choice, "account")),
            "party",
            "other::1220",
          ),
      ],
      [
        "input",
        (choice: Value) =>
          replacePreparedScalar(
            firstListValue(factoryRecordField(choice, "inputHoldingCids")),
            "contractId",
            "00other",
          ),
      ],
      [
        "output",
        (choice: Value) =>
          replacePreparedScalar(
            firstListValue(factoryRecordField(choice, "outputHoldingCids")),
            "contractId",
            "00other",
          ),
      ],
      [
        "leg amount",
        (choice: Value) =>
          replacePreparedScalar(
            factoryRecordField(firstLeg(choice), "amount"),
            "numeric",
            "9.0000000000",
          ),
      ],
      [
        "leg instrument",
        (choice: Value) =>
          replacePreparedScalar(
            factoryRecordField(firstLeg(choice), "instrumentId"),
            "text",
            "Other",
          ),
      ],
    ] as const)(
      "rejects changed EventLog choice %s",
      async (_label, mutate) => {
        await expectFactoryEffectRejection((prepared) =>
          mutate(eventChoice(prepared)),
        );
      },
    );

    it("rejects a nonempty EventLog result", async () => {
      await expectFactoryEffectRejection((prepared) => {
        const result = factoryExercise(prepared, "111").exerciseResult;
        if (result?.sum.oneofKind !== "record") {
          throw new Error("test event result is absent");
        }
        result.sum.record.fields.push({
          label: "hidden",
          value: fixtureScalar("text", "value"),
        });
      });
    });
  });
}
