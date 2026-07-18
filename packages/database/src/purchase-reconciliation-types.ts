import type { HumanSettlementExpectation } from "@sotto/x402-canton";
import type { Sha256Identifier } from "./publication-types.js";

export type HumanReconciliationClaimInput = Readonly<{
  attemptId?: Sha256Identifier;
  leaseOwner: string;
  leaseMilliseconds?: number;
}>;

export type HumanReconciliationLease = Readonly<{
  jobId: string;
  attemptId: Sha256Identifier;
  leaseGeneration: number;
  leaseOwner: string;
  claimedAt: string;
  leaseExpiresAt: string;
}>;

export type HumanReconciliationScope = Readonly<{
  attemptId: Sha256Identifier;
  beginExclusive: number;
  commandId: string;
  executionUserId: string;
  reconciliationOffset: number;
  submissionId: string;
  expectation: HumanSettlementExpectation;
}>;

export type HumanReconciliationClaimResult = Readonly<{
  lease: HumanReconciliationLease;
  scope: HumanReconciliationScope;
}>;

export type HumanReconciliationDeferInput = Readonly<{
  lease: HumanReconciliationLease;
  expectedReconciliationOffset: number;
  scannedThroughOffset: number;
  backoffMilliseconds?: number;
}>;

export type HumanReconciliationDeferResult = Readonly<{
  outcome: "requeued";
  attemptId: Sha256Identifier;
  reconciliationOffset: number;
  job: Readonly<{
    jobId: string;
    state: "ready";
    leaseGeneration: number;
    availableAt: string;
  }>;
}>;

export type HumanReconciliationRepository = Readonly<{
  claimHumanReconciliation(
    input: HumanReconciliationClaimInput,
  ): Promise<HumanReconciliationClaimResult | null>;
  deferHumanReconciliation(
    input: HumanReconciliationDeferInput,
  ): Promise<HumanReconciliationDeferResult>;
}>;
