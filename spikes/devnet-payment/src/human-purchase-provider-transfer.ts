/**
 * Compatibility entry point. Exact SendV2 and provider-Holding matching now
 * lives behind the authenticated package verifier and is intentionally private.
 */
export {
  authenticateHumanPurchaseProviderSettlement,
  readAuthenticatedHumanPurchaseProviderSettlement,
  type AuthenticatedHumanPurchaseProviderSettlement,
  type HumanPurchaseSettlementProof,
} from "./human-purchase-provider-reconciliation.js";
