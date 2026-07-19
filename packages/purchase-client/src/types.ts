/** Response shapes mirrored from the Sotto web API routes, field for field. */

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
  x402Version: number;
  scheme: string;
  network: string;
  asset: string;
  recipient: string;
  amountAtomic: string;
  transferMethod: string;
  lastVerifiedAt: string;
}>;

export type ResourceHealth = Readonly<Record<string, unknown>> | null;

export type PriceFacts = Readonly<{
  indexed: Readonly<{ amountAtomic: string; recipient: string }>;
  observed: Readonly<{
    amountAtomic: string;
    recipient: string;
    observedAt: string;
  }>;
  changed: boolean;
}>;

export type PurchaseInitiated = Readonly<{
  attemptId: string;
  outcome: "created" | "replayed";
  state: string;
  commandId: string;
  executeBefore: string;
  price: PriceFacts;
}>;

export type AttemptSummary = Readonly<{
  attemptId: string;
  state: string;
  createdAt: string;
  executeBefore: string;
  commandId: string;
  resourceRevisionId: string;
  purchaseCommitment: string;
}>;

export type AttemptEvent = Readonly<{
  sequence: number;
  type: string;
  recordedAt: string;
  updateId: string | null;
}>;

export type SettlementFacts = Readonly<{
  state: string;
  updateId: string | null;
  submissionId: string | null;
  executionStartedAt: string | null;
}> | null;

export type DeliveryFacts = Readonly<{
  claimState: string;
  failureCode: string | null;
  responseStatus: number | null;
  bodyByteCount: number | null;
  bodySha256: string | null;
  respondedAt: string | null;
}> | null;

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
  lifecycle: Readonly<Record<string, unknown>>;
  events: readonly AttemptEvent[];
  settlement: SettlementFacts;
  delivery: DeliveryFacts;
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
    status: string;
    updateId: string | null;
    explorerUrl: string | null;
  }>;
  delivery: Readonly<{
    status: string;
    failureCode: string | null;
    respondedAt: string | null;
  }>;
  timeline: readonly Readonly<{
    sequence: number;
    type: string;
    recordedAt: string;
    source: string;
    updateId: string | null;
  }>[];
  receipt: Readonly<Record<string, string | null>> | null;
  redactions: readonly Readonly<{ field: string; reason: string }>[];
}>;

export type StatsReport = Readonly<{
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
  railHealth: Readonly<Record<string, unknown>>;
  sourceCommit: string;
}>;

export type HealthReport = Readonly<{
  service: string;
  sourceCommit: string;
  fiveNorth: string;
}>;
