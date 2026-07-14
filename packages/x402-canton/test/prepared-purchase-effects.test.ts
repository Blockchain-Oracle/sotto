import type { Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedPurchasePrepareRequest,
  createPreparedPurchaseObserver,
} from "../src/index.js";
import { PREPARED_PURCHASE_EFFECT_CIDS } from "./prepared-purchase-effect.fixtures.js";
import { registerPreparedFactoryEffectCases } from "./prepared-purchase-factory-effects.cases.js";
import { registerPreparedFactoryResultCases } from "./prepared-purchase-factory-result.cases.js";
import {
  rootOnlyPreparedPurchaseBytes,
  validPreparedPurchase,
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

function node(prepared: PreparedPurchaseFixture, nodeId: string) {
  const wrapper = prepared.transaction!.nodes.find(
    (candidate) => candidate.nodeId === nodeId,
  )?.versionedNode;
  if (wrapper?.oneofKind !== "v1") throw new Error(`missing node ${nodeId}`);
  return wrapper.v1.nodeType;
}

function recordLabels(value: Value | undefined): string[] {
  if (value?.sum.oneofKind !== "record") return [];
  return value.sum.record.fields.map(({ label }) => label);
}

describe("prepared Purchase effect baseline", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
  });

  afterEach(() => vi.useRealTimers());

  it("models the complete synthetic descendant graph and exact results", async () => {
    const { intent, holdings, packageSelection, registry } =
      await purchaseCommandInputs();
    const request = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
      packageSelection,
    );
    const prepared = validPreparedPurchase(intent, request);
    const expectedIds = [
      "0",
      "100",
      "101",
      "102",
      "103",
      "104",
      "105",
      "106",
      "107",
    ];

    expect(prepared.transaction!.roots).toEqual(["0"]);
    expect(prepared.transaction!.nodes.map(({ nodeId }) => nodeId)).toEqual(
      expectedIds,
    );
    expect(prepared.metadata!.inputContracts).toHaveLength(3);
    expect(node(prepared, "0")).toMatchObject({
      oneofKind: "exercise",
      exercise: { children: ["100", "101", "105", "106", "107"] },
    });
    expect(node(prepared, "101")).toMatchObject({
      oneofKind: "exercise",
      exercise: { children: ["102", "103", "104"] },
    });
    const root = node(prepared, "0");
    const factory = node(prepared, "101");
    if (root.oneofKind !== "exercise" || factory.oneofKind !== "exercise") {
      throw new Error("effect fixture exercises are absent");
    }
    expect(recordLabels(root.exercise.exerciseResult)).toEqual([
      "capabilityCid",
      "contextCid",
      "receiverHoldingCids",
      "totalDebit",
    ]);
    expect(recordLabels(factory.exercise.exerciseResult)).toEqual([
      "output",
      "senderChangeCids",
      "meta",
    ]);
    expect(PREPARED_PURCHASE_EFFECT_CIDS).toMatchObject({
      inputHolding:
        request.commands[0]!.ExerciseCommand.choiceArgument.inputHoldingCids[0],
      receiverHolding: expect.any(String),
      senderChangeHolding: expect.any(String),
    });
  });

  it("rejects the legacy root-only graph", async () => {
    const { intent, holdings, packageSelection, registry } =
      await purchaseCommandInputs();
    const request = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
      packageSelection,
    );
    const bytes = rootOnlyPreparedPurchaseBytes(intent, request);
    const observe = createPreparedPurchaseObserver(async () => response(bytes));

    let accepted = false;
    try {
      await observe(request);
      accepted = true;
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/prepared.*effect/iu);
    }
    if (accepted) {
      throw new Error("PREPARED_EFFECTS_NOT_IMPLEMENTED");
    }
  });
});

registerPreparedFactoryEffectCases();
registerPreparedFactoryResultCases();
