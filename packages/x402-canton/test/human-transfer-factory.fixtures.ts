import { createHumanPurchaseHoldingObserver } from "../src/index.js";
import {
  authenticatedHumanPurchaseIntent,
  humanHoldingEntry,
  humanHoldingReader,
} from "./human-purchase-holding.fixtures.js";

export type AuthenticatedHumanIntent = Awaited<
  ReturnType<typeof authenticatedHumanPurchaseIntent>
>;

export function humanFactoryDisclosure(intent: AuthenticatedHumanIntent) {
  return {
    templateId: intent.tokenFactory.creationTemplateId,
    contractId: intent.tokenFactory.contractId,
    createdEventBlob: Buffer.from("human-factory").toString("base64"),
    synchronizerId: intent.challenge.synchronizerId,
  };
}

export function humanTransferFactoryResponse(intent: AuthenticatedHumanIntent) {
  return {
    factoryId: intent.tokenFactory.contractId,
    transferKind: "direct",
    choiceContext: {
      choiceContextData: {
        values: {
          "splice.example/round": {
            tag: "AV_ContractId",
            value: "00human-round",
          },
        },
      },
      disclosedContracts: [humanFactoryDisclosure(intent)],
    },
  };
}

export function humanTransferFactoryResponseBytes(
  intent: AuthenticatedHumanIntent,
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify(humanTransferFactoryResponse(intent)),
  );
}

export async function humanTransferFactoryInputs() {
  const intent = await authenticatedHumanPurchaseIntent();
  const holdings = await createHumanPurchaseHoldingObserver(
    humanHoldingReader([
      humanHoldingEntry("00human-b", "0.1500000000"),
      humanHoldingEntry("00human-a", "0.2000000000"),
    ]),
  )(intent);
  return { holdings, intent };
}
