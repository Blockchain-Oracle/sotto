import type { Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedPurchasePrepareRequest,
  createPreparedPurchaseObserver,
} from "../src/index.js";
import { PREPARED_PURCHASE_EFFECT_CIDS } from "./prepared-purchase-effect.fixtures.js";
import {
  preparedPurchaseBytes,
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

describe("synthetic Five North external-payer topology", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
  });

  afterEach(() => vi.useRealTimers());

  it("models the selected preapproval EventLog and context graph", async () => {
    const { intent, holdings, packageSelection, registry } =
      await purchaseCommandInputs();
    const request = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
      packageSelection,
    );
    const prepared = validPreparedPurchase(intent, request);

    expect(prepared.transaction!.roots).toEqual(["0"]);
    expect(prepared.transaction!.nodes.map(({ nodeId }) => nodeId)).toEqual([
      "0",
      "100",
      "101",
      "102",
      "103",
      "104",
      "105",
      "106",
      "107",
      "108",
      "109",
      "110",
      "111",
      "112",
    ]);
    expect(prepared.metadata!.inputContracts).toHaveLength(6);
    expect(node(prepared, "0")).toMatchObject({
      oneofKind: "exercise",
      exercise: { children: ["100", "101", "105", "106", "107"] },
    });
    expect(node(prepared, "101")).toMatchObject({
      oneofKind: "exercise",
      exercise: { children: ["108"] },
    });
    expect(node(prepared, "108")).toMatchObject({
      oneofKind: "exercise",
      exercise: {
        choiceId: "TransferPreapproval_SendV2",
        children: ["102", "103", "104", "109", "110", "111", "112"],
      },
    });
    for (const nodeId of ["111", "112"]) {
      expect(node(prepared, nodeId)).toMatchObject({
        oneofKind: "exercise",
        exercise: { choiceId: "EventLog_HoldingsChange", children: [] },
      });
    }
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
    expect(PREPARED_PURCHASE_EFFECT_CIDS.inputHolding).toBe(
      request.commands[0]!.ExerciseCommand.choiceArgument.inputHoldingCids[0],
    );
  });

  it("accepts the complete synthetic conformance graph", async () => {
    const { intent, holdings, packageSelection, registry } =
      await purchaseCommandInputs();
    const request = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
      packageSelection,
    );
    await expect(
      createPreparedPurchaseObserver(async () =>
        response(preparedPurchaseBytes(intent, request)),
      )(request),
    ).resolves.toBeDefined();
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
    await expect(
      createPreparedPurchaseObserver(async () => response(bytes))(request),
    ).rejects.toThrow(/prepared/iu);
  });

  it("rejects the legacy factory-only fallback", async () => {
    const { intent, holdings, packageSelection, registry } =
      await purchaseCommandInputs();
    const request = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
      packageSelection,
    );
    const bytes = preparedPurchaseBytes(intent, request, (prepared) => {
      const factory = node(prepared, "101");
      if (factory.oneofKind !== "exercise") throw new Error("factory absent");
      factory.exercise.children = ["102", "103", "104"];
      const removed = new Set(["108", "109", "110", "111", "112"]);
      prepared.transaction!.nodes = prepared.transaction!.nodes.filter(
        ({ nodeId }) => !removed.has(nodeId),
      );
      prepared.transaction!.nodeSeeds = prepared.transaction!.nodeSeeds.filter(
        ({ nodeId }) => ![108, 111, 112].includes(nodeId),
      );
    });
    await expect(
      createPreparedPurchaseObserver(async () => response(bytes))(request),
    ).rejects.toThrow(/prepared.*external.*transfer|preapproval/iu);
  });
});
