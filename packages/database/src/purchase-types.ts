import type { Sha256Identifier } from "./publication-types.js";
import type {
  HashVerifiedHumanPreparedPurchase,
  HumanPurchaseJournalIntent,
  HumanPurchaseLedgerIntent,
} from "@sotto/x402-canton";
import type {
  HumanPrepareAuthorityRestoreInput,
  HumanPrepareAuthorityRestoreScope,
} from "@sotto/x402-canton/internal/human-prepare-authority-persistence";
import type { PrepareAuthorityKeyring } from "./private-prepare-authority-types.js";
import type { HumanPurchaseAttemptResult } from "./purchase-result-types.js";

export type { HumanPurchaseAttemptResult };

export type HumanPurchasePersistenceBinding = Readonly<{
  ownerId: string;
  resourceRevisionId: string;
  beginExclusive: number;
}>;

export type HumanPurchaseBindingResolver = (
  intent: HumanPurchaseJournalIntent,
) => Promise<HumanPurchasePersistenceBinding>;

export type HumanPrepareAuthorityResolution = Readonly<{
  attemptId: Sha256Identifier;
  operationId: Sha256Identifier;
  ownerId: string;
  resourceRevisionId: string;
  purchaseCommitment: Sha256Identifier;
}>;

export type HumanPrepareAuthorityResolver = (
  purchase: HumanPrepareAuthorityResolution,
  scope: HumanPrepareAuthorityRestoreScope,
  lease: HumanPrepareAuthorityLease,
) => Promise<HumanPrepareAuthorityRestoreInput>;

export type HumanPrepareAuthorityClaimInput = Readonly<{
  leaseOwner: string;
  leaseMilliseconds?: number;
  resolve: HumanPrepareAuthorityResolver;
}>;

export type HumanPrepareAuthorityLease = Readonly<{
  jobId: string;
  attemptId: Sha256Identifier;
  leaseGeneration: number;
  leaseOwner: string;
  leaseExpiresAt: string;
  claimedAt: string;
}>;

export type HumanPrepareAuthorityClaimResult = Readonly<{
  lease: HumanPrepareAuthorityLease;
  intent: HumanPurchaseLedgerIntent;
}>;

export type HumanPrepareCheckpointInput = Readonly<{
  lease: HumanPrepareAuthorityLease;
  prepared: HashVerifiedHumanPreparedPurchase;
}>;

export type HumanPrepareCheckpointResult = Readonly<{
  outcome: "prepared-hash-verified";
  attemptId: Sha256Identifier;
  state: "prepared-hash-verified";
  preparedTransactionHash: Sha256Identifier;
  transferContextHash: Sha256Identifier;
  verifiedAt: string;
  event: Readonly<{
    sequence: 2;
    type: "prepared-hash-verified";
    eventHash: Sha256Identifier;
    previousEventHash: Sha256Identifier;
    recordedAt: string;
  }>;
  job: Readonly<{
    jobId: string;
    state: "completed";
    completedAt: string;
  }>;
}>;

export type PurchaseOperationalEvent = Readonly<{
  code: "PURCHASE_POOL_ERROR";
}>;

export type PurchaseRepositoryInput = Readonly<{
  databaseUrl: string;
  prepareAuthorityKeyring: PrepareAuthorityKeyring;
  sourceCommit: string;
  resolveHumanPurchaseBinding: HumanPurchaseBindingResolver;
  maxConnections?: number;
  applicationName?: string;
  onOperationalError?: (
    event: PurchaseOperationalEvent,
  ) => void | Promise<void>;
}>;

export type PurchaseRepository = Readonly<{
  initializeHumanPurchaseAttempt(
    intent: HumanPurchaseLedgerIntent,
  ): Promise<HumanPurchaseAttemptResult>;
  claimHumanPrepareAuthority(
    input: HumanPrepareAuthorityClaimInput,
  ): Promise<HumanPrepareAuthorityClaimResult | null>;
  completeHumanPrepare(
    input: HumanPrepareCheckpointInput,
  ): Promise<HumanPrepareCheckpointResult>;
  close(): Promise<void>;
}>;

export class PurchaseConflictError extends Error {
  readonly code = "PURCHASE_CONFLICT";

  constructor() {
    super("purchase identity conflict");
    this.name = "PurchaseConflictError";
  }
}

export class PurchasePersistenceError extends Error {
  readonly code = "PURCHASE_PERSISTENCE";

  constructor() {
    super("purchase persistence failed");
    this.name = "PurchasePersistenceError";
  }
}
