import type {
  Create,
  Exercise,
  Value,
} from "@canton-network/core-ledger-proto";
import { expect } from "vitest";
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

export function factoryExercise(
  prepared: PreparedPurchaseFixture,
  nodeId = "101",
): Exercise {
  const wrapper = prepared.transaction?.nodes.find(
    (candidate) => candidate.nodeId === nodeId,
  )?.versionedNode;
  if (wrapper?.oneofKind !== "v1") throw new Error(`missing node ${nodeId}`);
  const node = wrapper.v1.nodeType;
  if (node.oneofKind !== "exercise") {
    throw new Error(`node ${nodeId} is not an exercise`);
  }
  return node.exercise;
}

export function factoryRecordField(
  value: Value | undefined,
  label: string,
): Value {
  if (value?.sum.oneofKind !== "record") {
    throw new Error(`missing record for ${label}`);
  }
  const result = value.sum.record.fields.find(
    (candidate) => candidate.label === label,
  )?.value;
  if (result === undefined) throw new Error(`missing field ${label}`);
  return result;
}

export function preparedCreate(
  prepared: PreparedPurchaseFixture,
  nodeId: string,
): Create {
  const wrapper = prepared.transaction?.nodes.find(
    (candidate) => candidate.nodeId === nodeId,
  )?.versionedNode;
  if (wrapper?.oneofKind !== "v1") throw new Error(`missing node ${nodeId}`);
  const node = wrapper.v1.nodeType;
  if (node.oneofKind !== "create") {
    throw new Error(`node ${nodeId} is not a create`);
  }
  return node.create;
}

export function replacePreparedScalar(
  value: Value,
  kind:
    | "text"
    | "party"
    | "numeric"
    | "timestamp"
    | "int64"
    | "bool"
    | "contractId",
  replacement: string | boolean,
): void {
  value.sum = { oneofKind: kind, [kind]: replacement } as Value["sum"];
}

export async function expectFactoryEffectRejection(
  mutate: (prepared: PreparedPurchaseFixture) => void,
): Promise<void> {
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
  await expect(observe(request)).rejects.toThrow(/prepared/iu);
}
