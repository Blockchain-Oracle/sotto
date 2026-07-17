import type {
  Create,
  Exercise,
  Fetch,
  Value,
} from "@canton-network/core-ledger-proto";
import { inspectHumanPreparedPurchaseStructure } from "../src/human-prepared-purchase-validation.js";
import {
  humanPreparedPurchaseBytes,
  humanPreparedPurchaseCommandInputs,
  type HumanPreparedPurchaseFixture,
} from "./human-prepared-purchase.fixtures.js";

function nodeValue(prepared: HumanPreparedPurchaseFixture, nodeId: string) {
  const wrapper = prepared.transaction?.nodes.find(
    (candidate) => candidate.nodeId === nodeId,
  )?.versionedNode;
  if (wrapper?.oneofKind !== "v1") {
    throw new Error(`human prepared test node ${nodeId} is absent`);
  }
  return wrapper.v1.nodeType;
}

export function humanPreparedExercise(
  prepared: HumanPreparedPurchaseFixture,
  nodeId: string,
): Exercise {
  const value = nodeValue(prepared, nodeId);
  if (value.oneofKind !== "exercise") {
    throw new Error(`human prepared test node ${nodeId} is not an exercise`);
  }
  return value.exercise;
}

export function humanPreparedCreate(
  prepared: HumanPreparedPurchaseFixture,
  nodeId: string,
): Create {
  const value = nodeValue(prepared, nodeId);
  if (value.oneofKind !== "create") {
    throw new Error(`human prepared test node ${nodeId} is not a create`);
  }
  return value.create;
}

export function humanPreparedFetch(
  prepared: HumanPreparedPurchaseFixture,
  nodeId: string,
): Fetch {
  const value = nodeValue(prepared, nodeId);
  if (value.oneofKind !== "fetch") {
    throw new Error(`human prepared test node ${nodeId} is not a fetch`);
  }
  return value.fetch;
}

export function humanPreparedField(
  value: Value | undefined,
  label: string,
): Value {
  if (value?.sum.oneofKind !== "record") {
    throw new Error(`human prepared test ${label} record is absent`);
  }
  const field = value.sum.record.fields.find(
    (candidate) => candidate.label === label,
  );
  if (field?.value === undefined) {
    throw new Error(`human prepared test ${label} field is absent`);
  }
  return field.value;
}

export function humanPreparedReplaceField(
  value: Value | undefined,
  label: string,
  replacement: Value,
): void {
  if (value?.sum.oneofKind !== "record") {
    throw new Error(`human prepared test ${label} record is absent`);
  }
  const field = value.sum.record.fields.find(
    (candidate) => candidate.label === label,
  );
  if (field === undefined) {
    throw new Error(`human prepared test ${label} field is absent`);
  }
  field.value = replacement;
}

export function humanPreparedInput(
  prepared: HumanPreparedPurchaseFixture,
  contractId: string,
): Create {
  const input = prepared.metadata?.inputContracts.find((candidate) => {
    const contract = candidate.contract;
    return contract.oneofKind === "v1" && contract.v1.contractId === contractId;
  })?.contract;
  if (input?.oneofKind !== "v1") {
    throw new Error(`human prepared test input ${contractId} is absent`);
  }
  return input.v1;
}

export async function inspectHumanPreparedMutation(
  mutate: (prepared: HumanPreparedPurchaseFixture, packageId: string) => void,
): Promise<void> {
  const { intent, request } = await humanPreparedPurchaseCommandInputs();
  const bytes = humanPreparedPurchaseBytes(intent, request, (prepared) =>
    mutate(prepared, intent.packageSelection.packageIds[0]),
  );
  inspectHumanPreparedPurchaseStructure(bytes, intent, request);
}
