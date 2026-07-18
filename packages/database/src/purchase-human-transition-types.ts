export type HumanAttemptTransitionRow = Readonly<{
  attemptId: string;
  requestHash: string;
  state: string;
  preparedTransactionHash: string | null;
  transferContextHash: string | null;
  preparedVerifiedAt: Date | null;
  commandId: string;
  executeBefore: Date;
  connectorId: string | null;
  connectorKind: string | null;
  sessionId: string | null;
  decisionReason: string | null;
  approvalRequestedAt: Date | null;
  walletDecidedAt: Date | null;
  signatureVerifiedAt: Date | null;
  submissionId: string | null;
  executionUserId: string | null;
  executionStartedAt: Date | null;
}>;

export type HumanEventTransitionRow = Readonly<{
  attemptId: string;
  sequence: string;
  type: string;
  eventHash: string;
  previousEventHash: string | null;
  recordedAt: Date;
  preparedTransactionHash: string | null;
  transferContextHash: string | null;
  preparedVerifiedAt: Date | null;
  sessionId: string | null;
  connectorKind: string | null;
  connectorId: string | null;
  decisionReason: string | null;
  signatureVerifiedAt: Date | null;
  submissionId: string | null;
  executionUserId: string | null;
  executionStartedAt: Date | null;
}>;

export type HumanSettlementTransitionRow = Readonly<{
  attemptId: string;
  commandId: string;
  state: string;
  submissionId: string | null;
  executionUserId: string | null;
  executionStartedAt: Date | null;
}>;

export type HumanReconcileJobRow = Readonly<{
  jobId: string;
  dedupeKey: string;
  eventSequence: string;
  kind: string;
  state: string;
  availableAt: Date;
  createdAt: Date;
  leaseGeneration: string;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  claimedAt: Date | null;
  resultEventSequence: string | null;
  completedAt: Date | null;
}>;

export type HumanTransitionState = Readonly<{
  attempt: HumanAttemptTransitionRow;
  databaseNow: Date;
  events: readonly HumanEventTransitionRow[];
  jobs: readonly HumanReconcileJobRow[];
  settlement: HumanSettlementTransitionRow | null;
}>;
