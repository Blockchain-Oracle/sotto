import { describe, it } from "vitest";
import {
  factoryExercise,
  factoryRecordField,
  preparedCreate,
  replacePreparedScalar,
} from "./prepared-purchase-factory-effects.fixtures.js";
import { expectZeroSigning } from "./bounded-purchase-signer-boundary.fixtures.js";
import type { PreparedPurchaseFixture } from "./prepared-purchase.fixtures.js";

type Mutation = (prepared: PreparedPurchaseFixture) => void;

const semanticMutations: ReadonlyArray<readonly [string, Mutation]> = [
  [
    "package",
    (prepared) => {
      factoryExercise(prepared).templateId!.packageId = "e".repeat(64);
    },
  ],
  [
    "party",
    (prepared) => {
      factoryExercise(prepared, "0").actingParties = ["other::1220"];
    },
  ],
  [
    "node",
    (prepared) => {
      factoryExercise(prepared).children = factoryExercise(
        prepared,
      ).children.filter((nodeId) => nodeId !== "104");
      prepared.transaction!.nodes = prepared.transaction!.nodes.filter(
        ({ nodeId }) => nodeId !== "104",
      );
      prepared.transaction!.nodeSeeds = prepared.transaction!.nodeSeeds.filter(
        ({ nodeId }) => nodeId !== 104,
      );
    },
  ],
  [
    "result",
    (prepared) => {
      const value = factoryRecordField(
        factoryExercise(prepared, "0").exerciseResult,
        "receiverHoldingCids",
      );
      if (value.sum.oneofKind !== "list") throw new Error("missing receivers");
      value.sum.list.elements[0] = {
        sum: { oneofKind: "contractId", contractId: "00other" },
      };
    },
  ],
  [
    "value",
    (prepared) => {
      replacePreparedScalar(
        factoryRecordField(preparedCreate(prepared, "103").argument, "amount"),
        "numeric",
        "0.2400000000",
      );
    },
  ],
  [
    "fee",
    (prepared) => {
      const input = prepared.metadata!.inputContracts[2]!.contract;
      if (input.oneofKind !== "v1") throw new Error("missing Holding input");
      const changes = [
        [factoryRecordField(input.v1.argument, "amount"), "0.3760000000"],
        [
          factoryRecordField(
            factoryExercise(prepared, "0").exerciseResult,
            "totalDebit",
          ),
          "0.3260000000",
        ],
        [
          factoryRecordField(
            preparedCreate(prepared, "106").argument,
            "totalDebit",
          ),
          "0.3260000000",
        ],
        [
          factoryRecordField(
            preparedCreate(prepared, "107").argument,
            "remainingAllowance",
          ),
          "0.6740000000",
        ],
      ] as const;
      for (const [value, replacement] of changes) {
        replacePreparedScalar(value, "numeric", replacement);
      }
    },
  ],
  [
    "unknown effect",
    (prepared) => {
      const duplicate = structuredClone(
        prepared.transaction!.nodes.find(({ nodeId }) => nodeId === "103")!,
      );
      duplicate.nodeId = "108";
      const value = duplicate.versionedNode;
      if (
        value.oneofKind !== "v1" ||
        value.v1.nodeType.oneofKind !== "create"
      ) {
        throw new Error("missing create clone");
      }
      value.v1.nodeType.create.contractId = "00unknown";
      prepared.transaction!.nodes.push(duplicate);
      factoryExercise(prepared).children.push("108");
      prepared.transaction!.nodeSeeds.push({
        nodeId: 108,
        seed: new Uint8Array(32).fill(8),
      });
    },
  ],
];

export function registerSignerBoundaryMutationCases(): void {
  describe("zero-signing semantic mutation matrix", () => {
    it.each(semanticMutations)(
      "rejects a %s mutation",
      async (_name, mutate) => {
        await expectZeroSigning({ mutate });
      },
    );
  });
}
