import type { Create, Fetch, Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
  expectFactoryEffectRejection,
  factoryExercise,
  factoryRecordField,
} from "./prepared-purchase-factory-effects.fixtures.js";
import type { PreparedPurchaseFixture } from "./prepared-purchase.fixtures.js";
import { HOLDING_INTERFACE_ID } from "./prepared-purchase-effect-values.fixtures.js";
import { fixtureIdentifier } from "./prepared-purchase-value.fixtures.js";

function inputHolding(prepared: PreparedPurchaseFixture): Create {
  const input = prepared.metadata?.inputContracts.find(
    ({ contract }) =>
      contract.oneofKind === "v1" && contract.v1.contractId === "00holding-a",
  );
  if (input?.contract.oneofKind !== "v1") {
    throw new Error("test input Holding is absent");
  }
  return input.contract.v1;
}

function sourcePackage(prepared: PreparedPurchaseFixture): string {
  const packageId = inputHolding(prepared).templateId?.packageId;
  if (packageId === undefined) throw new Error("test source package is absent");
  return packageId;
}

function record(value: Value | undefined) {
  if (
    value?.sum.oneofKind !== "record" ||
    value.sum.record.recordId === undefined
  ) {
    throw new Error("test record identifier is absent");
  }
  return value.sum.record;
}

function fetch(prepared: PreparedPurchaseFixture, nodeId: string): Fetch {
  const wrapper = prepared.transaction?.nodes.find(
    (candidate) => candidate.nodeId === nodeId,
  )?.versionedNode;
  if (wrapper?.oneofKind !== "v1") throw new Error("test fetch is absent");
  const node = wrapper.v1.nodeType;
  if (node.oneofKind !== "fetch") throw new Error("test node is not a fetch");
  return node.fetch;
}

function fetchSourcePackage(
  prepared: PreparedPurchaseFixture,
  nodeId: string,
): string {
  const effect = fetch(prepared, nodeId);
  const input = prepared.metadata?.inputContracts.find(
    ({ contract }) =>
      contract.oneofKind === "v1" &&
      contract.v1.contractId === effect.contractId,
  );
  if (input?.contract.oneofKind !== "v1") {
    throw new Error("test fetch source is absent");
  }
  const source = input.contract.v1.templateId?.packageId;
  if (source === undefined || source === effect.templateId?.packageId) {
    throw new Error("test fetch source is not historical");
  }
  return source;
}

const holdingValues: ReadonlyArray<
  readonly [string, (input: Create) => Value | undefined]
> = [
  ["argument", (input) => input.argument],
  ["amount", (input) => factoryRecordField(input.argument, "amount")],
  [
    "round",
    (input) =>
      factoryRecordField(
        factoryRecordField(input.argument, "amount"),
        "createdAt",
      ),
  ],
  [
    "rate",
    (input) =>
      factoryRecordField(
        factoryRecordField(input.argument, "amount"),
        "ratePerRound",
      ),
  ],
];

export function registerPreparedUpgradeEffectCases(): void {
  describe("autonomous prepared package upgrades", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
    });
    afterEach(() => vi.useRealTimers());

    it.each(holdingValues)(
      "rejects a historical enriched Holding %s ID",
      async (_name, value) => {
        await expectFactoryEffectRejection((prepared) => {
          record(value(inputHolding(prepared))).recordId!.packageId =
            sourcePackage(prepared);
        });
      },
    );

    it("rejects a historical input Holding fetch", async () => {
      await expectFactoryEffectRejection((prepared) => {
        fetch(prepared, "100").templateId!.packageId = sourcePackage(prepared);
      });
    });

    it.each(["109", "110"])(
      "rejects historical package fallback for context fetch %s",
      async (nodeId) => {
        await expectFactoryEffectRejection((prepared) => {
          fetch(prepared, nodeId).templateId!.packageId = fetchSourcePackage(
            prepared,
            nodeId,
          );
        });
      },
    );

    it("rejects a historical Holding Archive template", async () => {
      await expectFactoryEffectRejection((prepared) => {
        factoryExercise(prepared, "102").templateId!.packageId =
          sourcePackage(prepared);
      });
    });

    it("rejects a Holding interface on the concrete Archive", async () => {
      await expectFactoryEffectRejection((prepared) => {
        factoryExercise(prepared, "102").interfaceId =
          fixtureIdentifier(HOLDING_INTERFACE_ID);
      });
    });

    it("rejects a changed Holding Archive record ID", async () => {
      await expectFactoryEffectRejection((prepared) => {
        record(
          factoryExercise(prepared, "102").chosenValue,
        ).recordId!.packageId = "f".repeat(64);
      });
    });
  });
}
