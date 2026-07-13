import {
  createPurchaseHoldingObserver,
  createTransferFactoryObserver,
  type BoundedPurchaseLedgerIntent,
  type PurchaseHoldingObservation,
  type TransferFactoryObservation,
} from "../src/index.js";
import {
  authenticatedPurchaseIntent,
  holdingEntry,
  holdingReader,
} from "./purchase-holding-observation.fixtures.js";

export async function purchaseExecutionInputs(
  contractId = "00holding-a",
  amount = "0.3250000000",
): Promise<{
  intent: BoundedPurchaseLedgerIntent;
  holdings: PurchaseHoldingObservation;
}> {
  const intent = authenticatedPurchaseIntent();
  const holdings = await createPurchaseHoldingObserver(
    holdingReader([holdingEntry(contractId, amount)]),
  )(intent);
  return { intent, holdings };
}

export function factoryDisclosure(intent: BoundedPurchaseLedgerIntent) {
  return {
    templateId: intent.tokenFactory.implementationTemplateId,
    contractId: intent.tokenFactory.contractId,
    createdEventBlob: Buffer.from("factory-disclosure").toString("base64"),
    synchronizerId: intent.challenge.synchronizerId,
  };
}

export function factoryResponse(
  intent: BoundedPurchaseLedgerIntent,
  overrides: Record<string, unknown> = {},
) {
  const { choiceContext: rawChoiceContext, ...rootOverrides } = overrides;
  return {
    factoryId: intent.tokenFactory.contractId,
    transferKind: "direct",
    choiceContext: {
      choiceContextData: { values: { "splice.example/round": "00round" } },
      disclosedContracts: [factoryDisclosure(intent)],
      ...(rawChoiceContext as Record<string, unknown> | undefined),
    },
    ...rootOverrides,
  };
}

export function responseBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

export async function purchaseCommandInputs(): Promise<{
  intent: BoundedPurchaseLedgerIntent;
  holdings: PurchaseHoldingObservation;
  registry: TransferFactoryObservation;
}> {
  const { intent, holdings } = await purchaseExecutionInputs();
  const registry = await createTransferFactoryObserver(async () =>
    responseBytes(factoryResponse(intent)),
  )(intent, holdings);
  return { intent, holdings, registry };
}
