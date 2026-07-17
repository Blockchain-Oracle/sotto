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
import type { HumanPurchaseFixtureOptions } from "./human-purchase-commitment.fixtures.js";
import {
  externalFactoryResponse,
  EXTERNAL_PURCHASE_CONTEXT,
  responseBytes,
} from "./transfer-factory-observation.fixtures.js";
import { HISTORICAL_HOLDING_TEMPLATE_ID } from "./prepared-purchase-effect-values.fixtures.js";

export type HumanPreparedPurchaseFixture = ReturnType<
  typeof PreparedTransaction.create
>;

export async function humanPreparedPurchaseCommandInputs(
  options: HumanPurchaseFixtureOptions = {},
) {
  const intent = await authenticatedHumanPurchaseIntent(options);
  return commandInputsForIntent(intent, [
    humanHoldingEntry(
      "00holding-a",
      "0.3250000000",
      intent.challenge.payerParty,
      intent.challenge.synchronizerId,
    ),
  ]);
}

export async function humanPreparedPurchaseCommandInputsWithUnusedDisclosures() {
  const intent = await authenticatedHumanPurchaseIntent();
  const response = historicalContextFactoryResponse(intent);
  const packageId = intent.packageSelection.packageIds[0];
  const unused = (contractId: string, templateId: string) => ({
    contractId,
    createdEventBlob: Buffer.from(`unused:${contractId}`).toString("base64"),
    synchronizerId: intent.challenge.synchronizerId,
    templateId: `${packageId}:${templateId}`,
  });
  return commandInputsForIntent(
    intent,
    [humanHoldingEntry("00holding-a", "0.3250000000")],
    {
      ...response,
      choiceContext: {
        ...response.choiceContext,
        disclosedContracts: [
          ...response.choiceContext.disclosedContracts,
          unused("00round", "Splice.Round:OpenMiningRound"),
          unused("00rules", "Splice.AmuletRules:AmuletRules"),
        ],
      },
    },
  );
}

function historicalContextFactoryResponse(intent: HumanPurchaseLedgerIntent) {
  const response = externalFactoryResponse(intent as never);
  const historicalPackageId = HISTORICAL_HOLDING_TEMPLATE_ID.split(":")[0]!;
  const contextIds = new Set<string>([
    EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
    EXTERNAL_PURCHASE_CONTEXT.featuredAppRight,
    EXTERNAL_PURCHASE_CONTEXT.transferPreapproval,
  ]);
  return {
    ...response,
    choiceContext: {
      ...response.choiceContext,
      disclosedContracts: response.choiceContext.disclosedContracts.map(
        (disclosure) => {
          if (!contextIds.has(disclosure.contractId)) return disclosure;
          const [, moduleName, entityName] = disclosure.templateId.split(":");
          if (!moduleName || !entityName) {
            throw new Error("test context template is invalid");
          }
          return {
            ...disclosure,
            templateId: `${historicalPackageId}:${moduleName}:${entityName}`,
          };
        },
      ),
    },
  };
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
  registryResponse: unknown = historicalContextFactoryResponse(intent),
) {
  const holdings = await createHumanPurchaseHoldingObserver(
    humanHoldingReader(contracts),
  )(intent);
  const registry = await createHumanTransferFactoryObserver(async () =>
    responseBytes(registryResponse),
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
