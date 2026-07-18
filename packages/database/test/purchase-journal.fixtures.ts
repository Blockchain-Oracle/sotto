import type {
  HumanPurchaseJournalIntent,
  HumanPurchaseLedgerIntent,
} from "@sotto/x402-canton";
import {
  authenticatedCatalogHumanPurchaseIntent,
  type JournalChallenge,
} from "./purchase-authenticated-intent.fixture.js";
import type { HumanPurchasePersistenceBinding } from "../src/index.js";
import { OWNER_ID, REVISION_ID } from "./publication.fixtures.js";

export const PURCHASE_SOURCE_COMMIT =
  "cfe1a6386fb555b6e081cc1dc6480527ce5e9b56";
export const PURCHASE_RESOURCE_URL =
  "https://weather.example.com/weather/current";

export const humanPurchaseBinding: HumanPurchasePersistenceBinding =
  Object.freeze({
    ownerId: OWNER_ID,
    resourceRevisionId: REVISION_ID,
    beginExclusive: 42,
  });

export async function catalogHumanPurchaseIntent(
  mutateChallenge: (challenge: JournalChallenge) => void = () => undefined,
): Promise<HumanPurchaseLedgerIntent> {
  return authenticatedCatalogHumanPurchaseIntent(
    PURCHASE_RESOURCE_URL,
    mutateChallenge,
  );
}

export function purchaseBindingResolver(
  binding = humanPurchaseBinding,
): (intent: HumanPurchaseJournalIntent) => Promise<typeof binding> {
  return async (intent) => {
    if (
      intent.resource.method !== "GET" ||
      intent.resource.origin !== "https://weather.example.com" ||
      intent.resource.path !== "/weather/current"
    ) {
      throw new Error("test purchase resource is not authenticated");
    }
    return binding;
  };
}
