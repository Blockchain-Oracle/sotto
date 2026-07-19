import type { Sha256Identifier } from "./publication-types.js";

type PurchaseAttemptBase = Readonly<{
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
  createdAt: string;
}>;

type InitialEvent = Readonly<{
  sequence: 1;
  type: "intent-created";
  eventHash: Sha256Identifier;
  previousEventHash: null;
  recordedAt: string;
}>;

type PrepareJobBase = Readonly<{
  jobId: string;
  dedupeKey: Sha256Identifier;
  kind: "purchase-prepare";
  availableAt: string;
  createdAt: string;
}>;

type ReadyPurchaseAttempt = PurchaseAttemptBase &
  Readonly<{
    outcome: "created" | "replayed";
    state: "intent-created";
    event: InitialEvent;
    job: PrepareJobBase & Readonly<{ state: "ready" }>;
  }>;

type LeasedPurchaseAttempt = PurchaseAttemptBase &
  Readonly<{
    outcome: "replayed";
    state: "intent-created";
    event: InitialEvent;
    job: PrepareJobBase &
      Readonly<{
        state: "leased";
        leaseGeneration: number;
        leaseOwner: string;
        leaseExpiresAt: string;
        claimedAt: string;
      }>;
  }>;

type PreparedPurchaseAttempt = PurchaseAttemptBase &
  Readonly<{
    outcome: "replayed";
    state: "prepared-hash-verified";
    prepared: Readonly<{
      preparedTransactionHash: Sha256Identifier;
      transferContextHash: Sha256Identifier;
      verifiedAt: string;
    }>;
    event: Readonly<{
      sequence: 2;
      type: "prepared-hash-verified";
      eventHash: Sha256Identifier;
      previousEventHash: Sha256Identifier;
      recordedAt: string;
    }>;
    job: PrepareJobBase &
      Readonly<{
        state: "completed";
        leaseGeneration: number;
        leaseOwner: string;
        leaseExpiresAt: string;
        claimedAt: string;
        resultEventSequence: 2;
        completedAt: string;
      }>;
  }>;

export type HumanPurchaseAttemptResult = Readonly<
  ReadyPurchaseAttempt | LeasedPurchaseAttempt | PreparedPurchaseAttempt
>;
