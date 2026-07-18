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

export type HumanReconciliationCompletion =
  | Readonly<{
      classification: "SUCCEEDED";
      completionOffset: number;
      updateId: string;
    }>
  | Readonly<{
      classification: "REJECTED";
      completionOffset: number;
      statusCode: number;
    }>;

export type HumanReconciliationCheckpointInput = Readonly<{
  lease: HumanReconciliationLease;
  expectedReconciliationOffset: number;
  completion: HumanReconciliationCompletion;
}>;

export type HumanReconciliationCheckpointResult = Readonly<{
  outcome: "created" | "replayed";
  attemptId: Sha256Identifier;
  state: "settlement-reconciled" | "settlement-rejected";
  completion: HumanReconciliationCompletion;
  reconciliationOffset: number;
  reconciledAt: string;
  event: Readonly<{
    sequence: 6;
    type: "settlement-reconciled" | "settlement-rejected";
    eventHash: Sha256Identifier;
    previousEventHash: Sha256Identifier;
    recordedAt: string;
  }>;
  job: Readonly<{
    jobId: string;
    state: "completed";
    leaseGeneration: number;
    resultEventSequence: 6;
    completedAt: string;
  }>;
}>;

export type HumanReconciliationRepository = Readonly<{
  claimHumanReconciliation(
    input: HumanReconciliationClaimInput,
  ): Promise<HumanReconciliationClaimResult | null>;
  deferHumanReconciliation(
    input: HumanReconciliationDeferInput,
  ): Promise<HumanReconciliationDeferResult>;
  completeHumanReconciliation(
    input: HumanReconciliationCheckpointInput,
  ): Promise<HumanReconciliationCheckpointResult>;
}>;

export type HumanReconciliationOperationalEvent = Readonly<{
  code: "HUMAN_RECONCILIATION_POOL_ERROR";
}>;

export type HumanReconciliationRepositoryRuntimeInput = Readonly<{
  databaseUrl: string;
  maxConnections?: number;
  applicationName?: string;
  onOperationalError?: (
    event: HumanReconciliationOperationalEvent,
  ) => void | Promise<void>;
}>;

export type HumanReconciliationRepositoryRuntime = Readonly<{
  repository: HumanReconciliationRepository;
  close(): Promise<void>;
}>;
