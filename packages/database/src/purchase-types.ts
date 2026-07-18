import type { Sha256Identifier } from "./publication-types.js";
import type {
  HumanPurchaseJournalIntent,
  HumanPurchaseLedgerIntent,
} from "@sotto/x402-canton";
import type {
  HumanPrepareAuthorityRestoreInput,
  HumanPrepareAuthorityRestoreScope,
} from "@sotto/x402-canton/internal/human-prepare-authority-persistence";
import type { PrepareAuthorityKeyring } from "./private-prepare-authority-types.js";

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
) => Promise<HumanPrepareAuthorityRestoreInput>;

export type HumanPrepareAuthorityClaimInput = Readonly<{
  leaseOwner: string;
  leaseMilliseconds?: number;
  resolve: HumanPrepareAuthorityResolver;
}>;

export type HumanPrepareAuthorityClaimResult = Readonly<{
  lease: Readonly<{
    jobId: string;
    attemptId: Sha256Identifier;
    leaseGeneration: number;
    leaseOwner: string;
    leaseExpiresAt: string;
    claimedAt: string;
  }>;
  intent: HumanPurchaseLedgerIntent;
}>;

export type HumanPurchaseAttemptResult = Readonly<{
  outcome: "created" | "replayed";
  operationId: Sha256Identifier;
  attemptId: Sha256Identifier;
  ownerId: string;
  resourceRevisionId: string;
  authorizationMode: "human-wallet";
  commitmentVersion: "sotto-human-purchase-v1";
  requestCommitment: Sha256Identifier;
  challengeId: Sha256Identifier;
  purchaseCommitment: Sha256Identifier;
  commandId: string;
  beginExclusive: number;
  executeBefore: string;
  sourceCommit: string;
  state: "intent-created";
  createdAt: string;
  event: Readonly<{
    sequence: 1;
    type: "intent-created";
    eventHash: Sha256Identifier;
    previousEventHash: null;
    recordedAt: string;
  }>;
  job: Readonly<{
    jobId: string;
    dedupeKey: Sha256Identifier;
    kind: "purchase-prepare";
    state: "ready";
    availableAt: string;
    createdAt: string;
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
