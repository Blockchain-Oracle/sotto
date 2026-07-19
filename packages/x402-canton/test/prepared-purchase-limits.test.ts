import type { Value } from "@canton-network/core-ledger-proto";
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
import {
  MAX_PREPARED_STRUCTURE_ITEMS,
  MAX_PREPARED_VALUE_DEPTH,
  PREPARED_PURCHASE_RESOURCE_LIMITS,
  validatePreparedPurchaseResourceEnvelope,
} from "../src/prepared-purchase-resource-envelope.js";
import { registerPreparedResourceLimitCases } from "./prepared-purchase-resource-limit.cases.js";

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

function rootExercise(prepared: PreparedPurchaseFixture) {
  const wrapper = prepared.transaction!.nodes[0]!.versionedNode;
  if (wrapper.oneofKind !== "v1") throw new Error("missing test root");
  const node = wrapper.v1.nodeType;
  if (node.oneofKind !== "exercise") throw new Error("missing test exercise");
  return node.exercise;
}

function nestedOptional(depth: number): Value {
  let value: Value = { sum: { oneofKind: "unit", unit: {} } };
  for (let index = 0; index < depth; index++) {
    value = { sum: { oneofKind: "optional", optional: { value } } };
  }
  return value;
}

function setExtraContext(
  prepared: PreparedPurchaseFixture,
  value: Value,
): void {
  const chosen = rootExercise(prepared).chosenValue;
  if (chosen?.sum.oneofKind !== "record")
    throw new Error("missing chosen record");
  const extra = chosen.sum.record.fields.find(
    ({ label }) => label === "extraArgs",
  );
  if (extra?.value?.sum.oneofKind !== "record")
    throw new Error("missing extraArgs");
  const context = extra.value.sum.record.fields.find(
    ({ label }) => label === "context",
  );
  if (context === undefined) throw new Error("missing context");
  context.value = value;
}

describe("prepared Purchase structural limits", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  registerPreparedResourceLimitCases();

  it("accepts the exact reviewed resource envelope", () => {
    expect(() =>
      validatePreparedPurchaseResourceEnvelope(
        PREPARED_PURCHASE_RESOURCE_LIMITS,
      ),
    ).not.toThrow();
  });

  it.each(Object.keys(PREPARED_PURCHASE_RESOURCE_LIMITS))(
    "rejects %s above its reviewed resource envelope",
    (field) => {
      expect(() =>
        validatePreparedPurchaseResourceEnvelope({
          ...PREPARED_PURCHASE_RESOURCE_LIMITS,
          [field]:
            PREPARED_PURCHASE_RESOURCE_LIMITS[
              field as keyof typeof PREPARED_PURCHASE_RESOURCE_LIMITS
            ] + 1,
        }),
      ).toThrow(/resource envelope/iu);
    },
  );

  it.each([
    [
      "chosen value",
      (prepared: PreparedPurchaseFixture) => {
        setExtraContext(prepared, nestedOptional(MAX_PREPARED_VALUE_DEPTH + 1));
      },
    ],
    [
      "exercise result",
      (prepared: PreparedPurchaseFixture) => {
        rootExercise(prepared).exerciseResult = nestedOptional(
          MAX_PREPARED_VALUE_DEPTH + 1,
        );
      },
    ],
    [
      "input contract",
      (prepared: PreparedPurchaseFixture) => {
        prepared.metadata!.inputContracts.push({
          contract: {
            oneofKind: "v1",
            v1: {
              lfVersion: "2.1",
              contractId: "00input-contract",
              packageName: "test-package",
              templateId: {
                packageId: "test-package-id",
                moduleName: "Test",
                entityName: "Input",
              },
              argument: nestedOptional(MAX_PREPARED_VALUE_DEPTH + 1),
              signatories: [],
              stakeholders: [],
            },
          },
          createdAt: 0n,
          eventBlob: new Uint8Array(),
        });
      },
    ],
  ])("rejects an over-depth %s", async (_label, mutate) => {
    const { intent, holdings, packageSelection, registry } =
      await purchaseCommandInputs();
    const request = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
      packageSelection,
    );
    const transaction = preparedPurchaseBytes(intent, request, mutate);
    const observe = createPreparedPurchaseObserver(async () =>
      response(transaction),
    );

    await expect(observe(request)).rejects.toThrow(/structural limits/i);
  });

  it("rejects an excessive aggregate value count", async () => {
    const { intent, holdings, packageSelection, registry } =
      await purchaseCommandInputs();
    const request = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
      packageSelection,
    );
    const transaction = preparedPurchaseBytes(intent, request, (prepared) => {
      setExtraContext(prepared, {
        sum: {
          oneofKind: "list",
          list: {
            elements: Array.from(
              { length: MAX_PREPARED_STRUCTURE_ITEMS + 1 },
              () => ({
                sum: { oneofKind: "unit", unit: {} },
              }),
            ),
          },
        },
      });
    });
    const observe = createPreparedPurchaseObserver(async () =>
      response(transaction),
    );

    await expect(observe(request)).rejects.toThrow(/structural limits/i);
  });
});
