import { readAuthenticatedHumanSettlementExpectation } from "./human-settlement-expectation.js";
import type { HumanSettlementExpectation } from "./human-settlement-expectation.js";
import {
  AUTHENTICATED_HUMAN_PROVIDER_SETTLEMENT_VERSION,
  type AuthenticatedHumanPurchaseProviderSettlement,
  type HumanPurchaseProviderSettlementEvidence,
  type HumanPurchaseSettlementProof,
} from "./human-provider-settlement-types.js";
import { verifyHumanProviderSettlementTransaction } from "./human-provider-settlement-verifier.js";

const authenticatedSettlements = new WeakMap<
  object,
  HumanPurchaseProviderSettlementEvidence
>();

export function authenticateHumanPurchaseProviderSettlement(
  response: unknown,
  proof: HumanPurchaseSettlementProof,
  candidateExpectation: HumanSettlementExpectation,
): AuthenticatedHumanPurchaseProviderSettlement {
  try {
    const expected =
      readAuthenticatedHumanSettlementExpectation(candidateExpectation);
    const snapshot = Object.freeze(
      structuredClone(proof),
    ) as HumanPurchaseSettlementProof;
    const transactionOffset = verifyHumanProviderSettlementTransaction(
      response,
      snapshot,
      expected,
    );
    if (transactionOffset === undefined) throw new Error("invalid settlement");
    const evidence = Object.freeze({
      ...snapshot,
      transactionOffset,
    }) satisfies HumanPurchaseProviderSettlementEvidence;
    const settlement = Object.freeze({
      version: AUTHENTICATED_HUMAN_PROVIDER_SETTLEMENT_VERSION,
    }) as AuthenticatedHumanPurchaseProviderSettlement;
    authenticatedSettlements.set(settlement, evidence);
    return settlement;
  } catch {
    throw new Error("human provider settlement did not reconcile");
  }
}

export function readAuthenticatedHumanPurchaseProviderSettlement(
  candidate: unknown,
): HumanPurchaseProviderSettlementEvidence {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("human provider settlement is not authenticated");
  }
  const evidence = authenticatedSettlements.get(candidate);
  if (evidence === undefined) {
    throw new Error("human provider settlement is not authenticated");
  }
  return evidence;
}

export type {
  AuthenticatedHumanPurchaseProviderSettlement,
  HumanPurchaseProviderSettlementEvidence,
  HumanPurchaseSettlementProof,
} from "./human-provider-settlement-types.js";
