/**
 * Response shapes of the Sotto API (apps/api/src/routes/*). These mirror
 * the server contracts exactly — nothing here invents a field the API does
 * not answer.
 */

export type CatalogResource = Readonly<{
  listingId: string;
  resourceId: string;
  resourceRevisionId: string;
  listingVersion: number;
  providerId: string;
  providerDisplayName: string;
  normalizedOrigin: string;
  name: string;
  description: string;
  method: string;
  routeTemplate: string;
  x402Version: 2;
  scheme: "exact";
  network: string;
  asset: string;
  recipient: string;
  amountAtomic: string;
  transferMethod: "transfer-factory";
  lastVerifiedAt: string;
}>;

export type ResourceHealth = Readonly<{
  healthObservationId: string;
  probeObservationId: string | null;
  resourceId: string;
  status: string;
  failureDomain: string | null;
  failureCode: string | null;
  httpStatus: number | null;
  observedAt: string;
  latencyMilliseconds: number;
}>;

export type StatsResponse = Readonly<{
  window: string;
  attempts: Readonly<{
    total: number;
    executed: number;
    settled: number;
    settlementRejected: number;
    delivered: number;
    deliveryFailed: number;
    settlementRate: number | null;
    deliveryRate: number | null;
  }>;
  probes: Readonly<{
    observations: number;
    healthy: number;
    degraded: number;
    failing: number;
    healthyRate: number | null;
  }>;
  railHealth: Readonly<{
    database: string;
    worker:
      | Readonly<{ state: "never-seen"; heartbeatAgeMilliseconds: null }>
      | Readonly<{
          state: "seen";
          workerId: string;
          sourceCommit: string;
          beatAt: string;
          heartbeatAgeMilliseconds: number | null;
        }>;
    fiveNorthConfigured: boolean;
  }>;
  sourceCommit: string;
}>;

export type PublicAttempt = Readonly<{
  attemptId: string;
  state: string;
  createdAt: string;
  executeBefore: string;
  method: string;
  routeTemplate: string;
  normalizedOrigin: string;
  resourceName: string;
  amountAtomic: string;
  asset: string;
}>;

export type TimelineEntry = Readonly<{
  sequence: number;
  type: string;
  recordedAt: string;
  source: "sotto-journal" | "canton-ledger";
  updateId: string | null;
}>;

export type AttemptEvidence = Readonly<{
  attemptId: string;
  state: string;
  createdAt: string;
  executeBefore: string;
  resource: Readonly<{
    method: string;
    origin: string;
    route: string;
    name: string;
  }> | null;
  amount: Readonly<{ atomic: string; asset: string }> | null;
  settlement: Readonly<{
    status:
      | "not-submitted"
      | "settlement-pending"
      | "settled"
      | "settlement-rejected";
    updateId: string | null;
    explorerUrl: string | null;
  }>;
  delivery: Readonly<{
    status:
      "not-started" | "delivery-pending" | "delivered" | "delivery-failed";
    failureCode: string | null;
    respondedAt: string | null;
  }>;
  timeline: readonly TimelineEntry[];
  receipt: Readonly<Record<string, string | null>> | null;
  redactions: readonly Readonly<{ field: string; reason: string }>[];
}>;

export type PriceFacts = Readonly<{
  indexed: Readonly<{ amountAtomic: string; recipient: string }>;
  observed: Readonly<{
    amountAtomic: string;
    recipient: string;
    observedAt: string;
  }>;
  changed: boolean;
}>;

export type PurchaseCreated = Readonly<{
  attemptId: string;
  outcome: "created" | "replayed";
  state: string;
  commandId: string;
  executeBefore: string;
  price: PriceFacts;
}>;

export type AttemptEvent = Readonly<{
  sequence: number;
  type: string;
  recordedAt: string;
  updateId: string | null;
}>;

export type OwnedAttempt = Readonly<{
  attemptId: string;
  state: string;
  createdAt: string;
  executeBefore: string;
  commandId: string;
  resourceRevisionId: string;
  purchaseCommitment: string;
}>;

export type PurchaseDetail = Readonly<{
  attempt: Readonly<{
    attemptId: string;
    state: string;
    createdAt: string;
    executeBefore: string;
    commandId: string;
    requestCommitment: string;
    challengeId: string;
    purchaseCommitment: string;
    preparedTransactionHash: string | null;
    sourceCommit: string;
  }>;
  lifecycle: Readonly<{
    state: string;
    latestEventType: string;
    submissionId: string | null;
  }> | null;
  events: readonly AttemptEvent[];
  settlement: Readonly<{
    state: string;
    updateId: string | null;
    submissionId: string | null;
    executionStartedAt: string | null;
  }> | null;
  delivery: Readonly<{
    claimState: string;
    failureCode: string | null;
    responseStatus: number | null;
    bodyByteCount: number | null;
    bodySha256: string | null;
    respondedAt: string | null;
  }> | null;
}>;

export type HostedOnboarding = Readonly<{
  partyId: string;
  walletId: string;
  fingerprint: string | null;
  walletUrl: string | null;
  session: Readonly<{ expiresAt: string }>;
}>;

export type OpsListing = Readonly<{
  listingId: string;
  state: string;
  version: number;
  resourceId: string;
  method: string;
  routeTemplate: string;
  normalizedOrigin: string;
  providerDisplayName: string;
  latestHealthStatus: string | null;
  latestHealthObservedAt: string | null;
}>;

export type RegisteredOrigin = Readonly<{
  registrationId: string;
  ownerId: string;
  ownerPartyId: string;
  providerId: string;
  providerDisplayName: string;
  originId: string;
  normalizedOrigin: string;
}>;

export type ProofChallenge = Readonly<{
  method: "well-known";
  token: string;
  wellKnownUrl: string;
  expiresAt: string;
}>;

export type ProofVerified = Readonly<{
  proofId: string;
  outcome: string;
  verifiedAt: string;
  expiresAt: string;
}>;

export type ProbeObservation = Readonly<{
  observationId: string;
  originId: string;
  resourceId: string;
  method: string;
  routeTemplate: string;
  observedAt: string;
  httpStatus: number;
  result: Readonly<{
    kind: "verified-x402" | "non-x402";
    revisionId?: string;
    name?: string;
    description?: string;
    network?: string;
    asset?: string;
    recipient?: string;
    amountAtomic?: string;
    transferMethod?: string;
    reason?: string;
  }>;
}>;

export type ProbeHealth = Readonly<{
  healthObservationId: string;
  originId: string;
  resourceId: string;
  method: string;
  routeTemplate: string;
  observedAt: string;
  latencyMilliseconds: number;
  result: Readonly<{
    kind: "healthy" | "degraded" | "failing";
    domain?: string;
    code?: string;
    httpStatus?: number;
  }>;
}>;
