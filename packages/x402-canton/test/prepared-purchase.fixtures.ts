import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import type {
  BoundedPurchaseLedgerIntent,
  BoundedPurchasePrepareRequest,
} from "../src/index.js";
import {
  buildEffectfulPreparedPurchaseNodes,
  buildEffectfulPreparedPurchaseSeeds,
} from "./prepared-purchase-effect.fixtures.js";
import { buildEffectfulPreparedPurchaseInputs } from "./prepared-purchase-effect-inputs.fixtures.js";

export type PreparedPurchaseFixture = ReturnType<
  typeof PreparedTransaction.create
>;

export function validPreparedPurchase(
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): PreparedPurchaseFixture {
  const requestedAtMicros =
    BigInt(Date.parse(intent.challenge.requestedAt)) * 1000n;
  const executeBeforeMicros = BigInt(Date.parse(request.maxRecordTime)) * 1000n;
  const preparationTime =
    BigInt(Date.parse("2026-07-13T10:00:02.000Z")) * 1000n;
  return PreparedTransaction.create({
    transaction: {
      version: "2.1",
      roots: ["0"],
      nodes: buildEffectfulPreparedPurchaseNodes(intent, request),
      nodeSeeds: buildEffectfulPreparedPurchaseSeeds(),
    },
    metadata: {
      submitterInfo: {
        actAs: [intent.capability.agentParty],
        commandId: request.commandId,
      },
      synchronizerId: request.synchronizerId,
      mediatorGroup: 0,
      transactionUuid: "00000000-0000-4000-8000-000000000001",
      preparationTime,
      inputContracts: buildEffectfulPreparedPurchaseInputs(intent),
      globalKeyMapping: [],
      minLedgerEffectiveTime: requestedAtMicros + 1n,
      maxLedgerEffectiveTime: executeBeforeMicros - 1n,
      maxRecordTime: executeBeforeMicros,
    },
  });
}

export function rootOnlyPreparedPurchase(
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): PreparedPurchaseFixture {
  const prepared = validPreparedPurchase(intent, request);
  const root = prepared.transaction!.nodes[0]!;
  const wrapper = root.versionedNode;
  if (wrapper.oneofKind !== "v1") throw new Error("test root is absent");
  const value = wrapper.v1.nodeType;
  if (value.oneofKind !== "exercise") throw new Error("test root is invalid");
  value.exercise.children = [];
  delete value.exercise.exerciseResult;
  prepared.transaction!.nodes = [root];
  prepared.transaction!.nodeSeeds = [
    { nodeId: 0, seed: new Uint8Array(32).fill(7) },
  ];
  prepared.metadata!.inputContracts = [];
  return prepared;
}

export function preparedPurchaseBytes(
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
  mutate?: (prepared: PreparedPurchaseFixture) => void,
): Uint8Array {
  const prepared = validPreparedPurchase(intent, request);
  mutate?.(prepared);
  return PreparedTransaction.toBinary(prepared, { writeUnknownFields: false });
}

export function rootOnlyPreparedPurchaseBytes(
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): Uint8Array {
  return PreparedTransaction.toBinary(
    rootOnlyPreparedPurchase(intent, request),
    {
      writeUnknownFields: false,
    },
  );
}
