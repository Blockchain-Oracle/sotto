import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import {
  buildHumanPurchasePrepareRequest,
  createHumanPurchaseHoldingObserver,
  createHumanTransferFactoryObserver,
  type HumanPurchaseLedgerIntent,
  type HumanPurchasePrepareRequest,
} from "../src/index.js";
import { humanPreparedPurchaseInputs as metadataInputs } from "./human-prepared-purchase-effect-inputs.fixtures.js";
import {
  humanPreparedPurchaseNodes,
  humanPreparedPurchaseSeeds,
} from "./human-prepared-purchase-effect.fixtures.js";
import {
  authenticatedHumanPurchaseIntent,
  authenticatedHumanPurchaseIntentWithWindow,
  humanHoldingEntry,
  humanHoldingReader,
} from "./human-purchase-holding.fixtures.js";
import {
  externalFactoryResponse,
  responseBytes,
} from "./transfer-factory-observation.fixtures.js";

export type HumanPreparedPurchaseFixture = ReturnType<
  typeof PreparedTransaction.create
>;

export async function humanPreparedPurchaseCommandInputs() {
  return commandInputsForIntent(await authenticatedHumanPurchaseIntent(), [
    humanHoldingEntry("00holding-a", "0.3250000000"),
  ]);
}

export async function humanPreparedPurchaseCommandInputsFor(
  contracts: unknown[],
) {
  return commandInputsForIntent(
    await authenticatedHumanPurchaseIntent(),
    contracts,
  );
}

export async function humanPreparedPurchaseCommandInputsWithWindow(
  seconds: number,
) {
  return commandInputsForIntent(
    await authenticatedHumanPurchaseIntentWithWindow(seconds),
    [humanHoldingEntry("00holding-a", "0.3250000000")],
  );
}

async function commandInputsForIntent(
  intent: HumanPurchaseLedgerIntent,
  contracts: unknown[],
) {
  const holdings = await createHumanPurchaseHoldingObserver(
    humanHoldingReader(contracts),
  )(intent);
  const registry = await createHumanTransferFactoryObserver(async () =>
    responseBytes(externalFactoryResponse(intent as never)),
  )(intent, holdings);
  const request = buildHumanPurchasePrepareRequest(intent, holdings, registry);
  return { intent, request };
}

export function validHumanPreparedPurchase(
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): HumanPreparedPurchaseFixture {
  const requestedAt = BigInt(Date.parse(intent.challenge.requestedAt)) * 1_000n;
  const executeBefore = BigInt(Date.parse(request.maxRecordTime)) * 1_000n;
  return PreparedTransaction.create({
    transaction: {
      version: "2.1",
      roots: ["0"],
      nodes: humanPreparedPurchaseNodes(intent, request),
      nodeSeeds: humanPreparedPurchaseSeeds(request),
    },
    metadata: {
      submitterInfo: {
        actAs: [...request.actAs],
        commandId: request.commandId,
      },
      synchronizerId: request.synchronizerId,
      mediatorGroup: 0,
      transactionUuid: "00000000-0000-4000-8000-000000000002",
      preparationTime: requestedAt + 1_000n,
      inputContracts: metadataInputs(intent, request),
      globalKeyMapping: [],
      minLedgerEffectiveTime: requestedAt + 1n,
      maxLedgerEffectiveTime: executeBefore - 1n,
      maxRecordTime: executeBefore,
    },
  });
}

export function humanPreparedPurchaseBytes(
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
  mutate?: (prepared: HumanPreparedPurchaseFixture) => void,
): Uint8Array {
  const prepared = validHumanPreparedPurchase(intent, request);
  mutate?.(prepared);
  return PreparedTransaction.toBinary(prepared, { writeUnknownFields: false });
}

export function rootOnlyHumanPreparedPurchaseBytes(
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): Uint8Array {
  const prepared = validHumanPreparedPurchase(intent, request);
  const root = prepared.transaction!.nodes[0]!;
  if (root.versionedNode.oneofKind !== "v1") throw new Error("root is absent");
  const node = root.versionedNode.v1.nodeType;
  if (node.oneofKind !== "exercise") throw new Error("root is invalid");
  node.exercise.children = [];
  prepared.transaction!.nodes = [root];
  prepared.transaction!.nodeSeeds = [
    { nodeId: 0, seed: new Uint8Array(32).fill(1) },
  ];
  return PreparedTransaction.toBinary(prepared, { writeUnknownFields: false });
}
