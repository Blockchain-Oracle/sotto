export type HumanPurchaseSettlementProof = Readonly<{
  attemptId: `sha256:${string}`;
  challengeId: `sha256:${string}`;
  requestCommitment: `sha256:${string}`;
  purchaseCommitment: `sha256:${string}`;
  updateId: string;
}>;

export type HumanPurchaseProviderSettlementEvidence =
  HumanPurchaseSettlementProof &
    Readonly<{
      /** Must equal the successful completion offset before terminal persistence. */
      transactionOffset: number;
    }>;

export const AUTHENTICATED_HUMAN_PROVIDER_SETTLEMENT_VERSION =
  "sotto-authenticated-human-provider-settlement-v1" as const;

declare const authenticatedHumanProviderSettlementBrand: unique symbol;

export type AuthenticatedHumanPurchaseProviderSettlement = Readonly<{
  version: typeof AUTHENTICATED_HUMAN_PROVIDER_SETTLEMENT_VERSION;
  readonly [authenticatedHumanProviderSettlementBrand]: true;
}>;
