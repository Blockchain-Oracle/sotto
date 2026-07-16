import {
  createPurchaseHoldingObserver,
  createTransferFactoryObserver,
  type BoundedPurchaseLedgerIntent,
  type PurchaseHoldingObservation,
  type TransferFactoryObservation,
} from "../src/index.js";
import {
  authenticatedPurchaseInputs,
  holdingEntry,
  holdingReader,
} from "./purchase-holding-observation.fixtures.js";

export async function purchaseExecutionInputs(
  contractId = "00holding-a",
  amount = "0.3250000000",
): Promise<{
  intent: BoundedPurchaseLedgerIntent;
  holdings: PurchaseHoldingObservation;
  packageSelection: ReturnType<
    typeof authenticatedPurchaseInputs
  >["packageSelection"];
}> {
  const { intent, packageSelection } = authenticatedPurchaseInputs();
  const holdings = await createPurchaseHoldingObserver(
    holdingReader([holdingEntry(contractId, amount)]),
  )(intent);
  return { intent, holdings, packageSelection };
}

export function factoryDisclosure(intent: BoundedPurchaseLedgerIntent) {
  return {
    templateId: intent.tokenFactory.creationTemplateId,
    contractId: intent.tokenFactory.contractId,
    createdEventBlob: Buffer.from("factory-disclosure").toString("base64"),
    synchronizerId: intent.challenge.synchronizerId,
  };
}

export const EXTERNAL_PURCHASE_CONTEXT = Object.freeze({
  externalPartyConfigState: "00external-party-config-state",
  featuredAppRight: "00featured-app-right",
  round: "00round",
  transferPreapproval: "00transfer-preapproval",
});

function selectedSplicePackage(intent: BoundedPurchaseLedgerIntent): string {
  const matches = intent.packageSelection.references.filter(
    ({ packageName }) => packageName === "splice-amulet",
  );
  if (matches.length !== 1) throw new Error("test Splice package is absent");
  return matches[0]!.packageId;
}

function externalDisclosure(
  intent: BoundedPurchaseLedgerIntent,
  contractId: string,
  moduleName: string,
  entityName: string,
) {
  return {
    templateId: `${selectedSplicePackage(intent)}:${moduleName}:${entityName}`,
    contractId,
    createdEventBlob: Buffer.from(`external:${contractId}`).toString("base64"),
    synchronizerId: intent.challenge.synchronizerId,
  };
}

export function externalFactoryResponse(intent: BoundedPurchaseLedgerIntent) {
  return {
    factoryId: intent.tokenFactory.contractId,
    transferKind: "direct",
    choiceContext: {
      choiceContextData: {
        values: {
          "external-party-config-state": {
            tag: "AV_ContractId",
            value: EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
          },
          "featured-app-right": {
            tag: "AV_ContractId",
            value: EXTERNAL_PURCHASE_CONTEXT.featuredAppRight,
          },
          "splice.example/round": {
            tag: "AV_ContractId",
            value: EXTERNAL_PURCHASE_CONTEXT.round,
          },
          "transfer-preapproval": {
            tag: "AV_ContractId",
            value: EXTERNAL_PURCHASE_CONTEXT.transferPreapproval,
          },
        },
      },
      disclosedContracts: [
        factoryDisclosure(intent),
        externalDisclosure(
          intent,
          EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
          "Splice.ExternalPartyConfigState",
          "ExternalPartyConfigState",
        ),
        externalDisclosure(
          intent,
          EXTERNAL_PURCHASE_CONTEXT.featuredAppRight,
          "Splice.AmuletRules",
          "FeaturedAppRight",
        ),
        externalDisclosure(
          intent,
          EXTERNAL_PURCHASE_CONTEXT.transferPreapproval,
          "Splice.AmuletRules",
          "TransferPreapproval",
        ),
      ],
    },
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
      choiceContextData: {
        values: {
          "splice.example/round": {
            tag: "AV_ContractId",
            value: "00round",
          },
        },
      },
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
  packageSelection: ReturnType<
    typeof authenticatedPurchaseInputs
  >["packageSelection"];
  registry: TransferFactoryObservation;
}> {
  const { intent, holdings, packageSelection } =
    await purchaseExecutionInputs();
  const registry = await createTransferFactoryObserver(async () =>
    responseBytes(externalFactoryResponse(intent)),
  )(intent, holdings);
  return { intent, holdings, packageSelection, registry };
}
