import type { HumanObservationReadOptions } from "./human-observation-deadline.js";
import type {
  PurchaseHoldingAcsRequest,
  ValidatedDisclosedContract,
} from "./purchase-holding-types.js";

export type HumanPurchaseHoldingReader = Readonly<{
  readLedgerEnd: (options: HumanObservationReadOptions) => Promise<unknown>;
  readActiveContracts: (
    request: PurchaseHoldingAcsRequest,
    options: HumanObservationReadOptions,
  ) => Promise<unknown>;
}>;

export type HumanPurchaseHoldingObservation = Readonly<{
  observationId: `sha256:${string}`;
  observedAt: string;
}>;

export type HumanPurchaseHoldingExecutionMaterial = Readonly<{
  attemptId: `sha256:${string}`;
  purchaseCommitment: `sha256:${string}`;
  contractIds: readonly string[];
  disclosedContracts: readonly ValidatedDisclosedContract[];
}>;
