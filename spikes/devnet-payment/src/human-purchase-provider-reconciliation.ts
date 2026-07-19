import {
  authenticateHumanPurchaseProviderSettlement,
  readAuthenticatedHumanPurchaseProviderSettlement as readProductionSettlement,
  type AuthenticatedHumanPurchaseProviderSettlement,
  type HumanPurchaseSettlementProof,
  type HumanSettlementExpectation,
} from "@sotto/x402-canton";

export const AUTHENTICATED_HUMAN_PROVIDER_SETTLEMENT_VERSION =
  "sotto-authenticated-human-provider-settlement-v1" as const;

export {
  authenticateHumanPurchaseProviderSettlement,
  type AuthenticatedHumanPurchaseProviderSettlement,
  type HumanPurchaseSettlementProof,
};

export function reconcileHumanPurchaseProviderTransaction(
  response: unknown,
  proof: HumanPurchaseSettlementProof,
  expectation: HumanSettlementExpectation,
): boolean {
  try {
    authenticateHumanPurchaseProviderSettlement(response, proof, expectation);
    return true;
  } catch {
    return false;
  }
}

export function readAuthenticatedHumanPurchaseProviderSettlement(
  candidate: unknown,
): HumanPurchaseSettlementProof {
  const evidence = readProductionSettlement(candidate);
  return Object.freeze({
    attemptId: evidence.attemptId,
    challengeId: evidence.challengeId,
    requestCommitment: evidence.requestCommitment,
    purchaseCommitment: evidence.purchaseCommitment,
    updateId: evidence.updateId,
  });
}
