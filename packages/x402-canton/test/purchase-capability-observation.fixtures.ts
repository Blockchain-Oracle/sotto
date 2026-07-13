import { capturePurchaseCapabilityCreatedEventForTest } from "../src/purchase-capability-observation.js";
import type { PurchaseCapabilityObservation } from "../src/index.js";
import {
  AGENT,
  CAPABILITY_TEMPLATE_ID,
  DSO,
  PAYER,
  PROVIDER,
} from "./purchase-commitment.fixtures.js";

export function createdCapabilityEvent() {
  return {
    nodeId: 0,
    contractId: "00capability7",
    templateId: CAPABILITY_TEMPLATE_ID,
    contractKey: null,
    createArgument: {
      payer: PAYER,
      agent: AGENT,
      resourceBindingVersion: "sotto-resource-v1",
      allowedResourceHash:
        "sha256:f8fe5b158e6d56ef4b320ace4f94600f36c6401e69604469ebc20e45f42605bc",
      allowedRecipient: PROVIDER,
      instrumentId: { admin: DSO, id: "Amulet" },
      perCallLimit: "0.3000000000",
      remainingAllowance: "1.0000000000",
      maximumTotalDebit: "0.3250000000",
      expiresAt: "2026-07-13T11:00:00.000Z",
      revision: "7",
      paused: false,
      transferFactoryCid: "00tokenfactory7",
      expectedAdmin: DSO,
    },
    createdEventBlob: "capability-created-event-blob",
    interfaceViews: [],
    witnessParties: [PAYER, AGENT],
    signatories: [PAYER],
    observers: [AGENT],
    createdAt: "2026-07-13T09:59:00.000000Z",
    packageName: "sotto-control",
  };
}

export type CapabilityEvent = ReturnType<typeof createdCapabilityEvent>;

export function captureCapabilityEvent(
  event = createdCapabilityEvent(),
  activeAtOffset = 42,
): PurchaseCapabilityObservation {
  return capturePurchaseCapabilityCreatedEventForTest(event, activeAtOffset);
}
