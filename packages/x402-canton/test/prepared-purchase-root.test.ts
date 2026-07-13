import type { Exercise, Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedPurchasePrepareRequest,
  createPreparedPurchaseObserver,
} from "../src/index.js";
import {
  preparedPurchaseBytes,
  type PreparedPurchaseFixture,
} from "./prepared-purchase.fixtures.js";
import { purchaseCommandInputs } from "./transfer-factory-observation.fixtures.js";

const preparedHash = Buffer.alloc(32, 7).toString("base64");

function response(transaction: Uint8Array): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      preparedTransaction: Buffer.from(transaction).toString("base64"),
      preparedTransactionHash: preparedHash,
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      hashingDetails: null,
      costEstimation: null,
    }),
  );
}

function rootExercise(prepared: PreparedPurchaseFixture): Exercise {
  const wrapper = prepared.transaction!.nodes[0]!.versionedNode;
  if (wrapper.oneofKind !== "v1") throw new Error("missing root");
  const node = wrapper.v1.nodeType;
  if (node.oneofKind !== "exercise") throw new Error("missing exercise");
  return node.exercise;
}

function choiceField(exercise: Exercise, label: string): Value {
  if (exercise.chosenValue?.sum.oneofKind !== "record") {
    throw new Error("missing choice record");
  }
  const value = exercise.chosenValue.sum.record.fields.find(
    (field) => field.label === label,
  )?.value;
  if (value === undefined) throw new Error(`missing ${label}`);
  return value;
}

async function expectRootRejection(
  mutate: (prepared: PreparedPurchaseFixture) => void,
): Promise<void> {
  const { intent, holdings, registry } = await purchaseCommandInputs();
  const request = buildBoundedPurchasePrepareRequest(
    intent,
    holdings,
    registry,
  );
  const transaction = preparedPurchaseBytes(intent, request, mutate);
  const observe = createPreparedPurchaseObserver(async () =>
    response(transaction),
  );
  await expect(observe(request)).rejects.toThrow();
}

describe("prepared Purchase root identity", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [
      "template package",
      (exercise: Exercise) => {
        exercise.templateId!.packageId = "other-package";
      },
    ],
    [
      "template module",
      (exercise: Exercise) => {
        exercise.templateId!.moduleName = "Other";
      },
    ],
    [
      "template entity",
      (exercise: Exercise) => {
        exercise.templateId!.entityName = "Other";
      },
    ],
    [
      "interface",
      (exercise: Exercise) => {
        exercise.interfaceId = structuredClone(exercise.templateId!);
      },
    ],
    [
      "package name",
      (exercise: Exercise) => {
        exercise.packageName = "other";
      },
    ],
    [
      "signatory",
      (exercise: Exercise) => {
        exercise.signatories = ["other::1220"];
      },
    ],
    [
      "stakeholders",
      (exercise: Exercise) => {
        exercise.stakeholders = ["other::1220"];
      },
    ],
    [
      "choice observer",
      (exercise: Exercise) => {
        exercise.choiceObservers = ["other::1220"];
      },
    ],
  ])("rejects a mismatched %s", async (_label, mutate) => {
    await expectRootRejection((prepared) => mutate(rootExercise(prepared)));
  });

  it.each([
    ["attemptId", "text", "sha256:other"],
    ["purchaseCommitment", "text", "sha256:other"],
    ["requestCommitment", "text", "sha256:other"],
    ["challengeId", "text", "sha256:other"],
    ["resourceHash", "text", "sha256:other"],
    ["recipient", "party", "other::1220"],
    ["amount", "numeric", "9.0000000000"],
    ["requestedAt", "timestamp", "1"],
    ["executeBefore", "timestamp", "1"],
    ["expectedRevision", "int64", "9"],
  ])("rejects a changed %s", async (label, kind, replacement) => {
    await expectRootRejection((prepared) => {
      const value = choiceField(rootExercise(prepared), label);
      value.sum = { oneofKind: kind, [kind]: replacement } as Value["sum"];
    });
  });

  it("rejects changed input holdings and ambiguous choice fields", async () => {
    await expectRootRejection((prepared) => {
      const value = choiceField(rootExercise(prepared), "inputHoldingCids");
      if (value.sum.oneofKind !== "list") throw new Error("missing holdings");
      value.sum.list.elements[0] = {
        sum: { oneofKind: "contractId", contractId: "00other-holding" },
      };
    });
    await expectRootRejection((prepared) => {
      const exercise = rootExercise(prepared);
      if (exercise.chosenValue?.sum.oneofKind !== "record") {
        throw new Error("missing choice record");
      }
      exercise.chosenValue.sum.record.fields.push(
        structuredClone(exercise.chosenValue.sum.record.fields[0]!),
      );
    });
  });
});
