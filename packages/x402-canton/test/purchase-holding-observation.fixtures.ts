import {
  commitBoundedPurchase,
  readBoundedPurchaseLedgerIntent,
} from "../src/index.js";
import { createPurchaseInput, PAYER } from "./purchase-commitment.fixtures.js";

export const HOLDING_INTERFACE_PACKAGE_ID =
  "718a0f77e505a8de22f188bd4c87fe74101274e9d4cb1bfac7d09aec7158d35b";
export const HOLDING_IMPLEMENTATION_PACKAGE_ID =
  "73e9ffdb6b0bc19a5f67372b118103926da11547ab9109eccae47e4e4cc35d6f";
export const HOLDING_TEMPLATE_PACKAGE_ID =
  "23f47481dab6b1ec01339d6e14494d85bb2844c25f45b26fc5c9ef4cd4942d1f";
export const HOLDING_INTERFACE_ID = `${HOLDING_INTERFACE_PACKAGE_ID}:Splice.Api.Token.HoldingV1:Holding`;
export const HOLDING_TEMPLATE_ID = `${HOLDING_TEMPLATE_PACKAGE_ID}:Splice.Amulet:Amulet`;

export function authenticatedPurchaseIntent() {
  return readBoundedPurchaseLedgerIntent(
    commitBoundedPurchase(createPurchaseInput()),
  );
}

export function holdingEntry(
  contractId: string,
  amount: string,
  overrides: Record<string, unknown> = {},
) {
  const viewValue = {
    owner: PAYER,
    instrumentId: { admin: "DSO::1220dso", id: "Amulet" },
    amount,
    lock: null,
    meta: { values: {} },
    ...(overrides.viewValue as Record<string, unknown> | undefined),
  };
  const createdEvent = {
    offset: 41,
    nodeId: 0,
    contractId,
    templateId: HOLDING_TEMPLATE_ID,
    contractKey: null,
    createArgument: {},
    createdEventBlob: Buffer.from(`holding:${contractId}`).toString("base64"),
    interfaceViews: [
      {
        interfaceId: HOLDING_INTERFACE_ID,
        viewStatus: { code: 0, message: "", details: [] },
        viewValue,
        implementationPackageId: HOLDING_IMPLEMENTATION_PACKAGE_ID,
        ...(overrides.interfaceView as Record<string, unknown> | undefined),
      },
    ],
    witnessParties: [PAYER],
    signatories: [PAYER],
    observers: [],
    createdAt: "2026-07-13T09:59:00.000000Z",
    packageName: "splice-amulet",
    ...(overrides.createdEvent as Record<string, unknown> | undefined),
  };
  return {
    contractEntry: {
      JsActiveContract: {
        createdEvent,
        synchronizerId: "global-domain::1220sync",
        reassignmentCounter: 0,
        ...(overrides.activeContract as Record<string, unknown> | undefined),
      },
    },
  };
}

export function holdingReader(contracts: unknown[]) {
  return {
    readLedgerEnd: async () => ({ offset: 42 }),
    readActiveContracts: async () => contracts,
  };
}
