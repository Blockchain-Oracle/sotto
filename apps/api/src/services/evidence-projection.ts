import type { PurchaseAggregateRow } from "@sotto/database";
import type {
  AttemptEvent,
  DeliveryFacts,
  PublicAttemptRow,
  SettlementFacts,
} from "./purchase-reads.js";

export type EvidenceViewer = "public" | "owner";

export type TimelineEntry = Readonly<{
  sequence: number;
  type: string;
  recordedAt: string;
  source: "sotto-journal" | "canton-ledger";
  updateId: string | null;
}>;

export type SettlementProjection = Readonly<{
  status:
    "not-submitted" | "settlement-pending" | "settled" | "settlement-rejected";
  updateId: string | null;
  explorerUrl: string | null;
}>;

export type DeliveryProjection = Readonly<{
  status: "not-started" | "delivery-pending" | "delivered" | "delivery-failed";
  failureCode: string | null;
  respondedAt: string | null;
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
  settlement: SettlementProjection;
  delivery: DeliveryProjection;
  timeline: readonly TimelineEntry[];
  receipt: Readonly<Record<string, string | null>> | null;
  redactions: readonly Readonly<{ field: string; reason: string }>[];
}>;

const PRIVATE_REASON = "Private resource context";

function settlementProjection(
  state: string,
  settlement: SettlementFacts | null,
  events: readonly AttemptEvent[],
  explorerBaseUrl: string | undefined,
): SettlementProjection {
  const eventUpdateId =
    events.findLast((event) => event.updateId !== null)?.updateId ?? null;
  const updateId = settlement?.updateId ?? eventUpdateId;
  const explorerUrl =
    updateId !== null && explorerBaseUrl !== undefined
      ? `${explorerBaseUrl}/updates/${encodeURIComponent(updateId)}`
      : null;
  if (state === "settlement-reconciled") {
    // A reconciled settlement whose explorer indexing lags stays "settled"
    // with a null link — indexing-pending is never rendered as failure.
    return Object.freeze({ status: "settled", updateId, explorerUrl });
  }
  if (state === "settlement-rejected") {
    return Object.freeze({
      status: "settlement-rejected",
      updateId,
      explorerUrl,
    });
  }
  if (state === "execution-started") {
    return Object.freeze({
      status: "settlement-pending",
      updateId,
      explorerUrl,
    });
  }
  return Object.freeze({ status: "not-submitted", updateId, explorerUrl });
}

function deliveryProjection(
  state: string,
  delivery: DeliveryFacts | null,
): DeliveryProjection {
  if (delivery === null) {
    return Object.freeze({
      status:
        state === "settlement-reconciled" ? "delivery-pending" : "not-started",
      failureCode: null,
      respondedAt: null,
    });
  }
  if (delivery.responseStatus !== null) {
    return Object.freeze({
      status: "delivered",
      failureCode: null,
      respondedAt: delivery.respondedAt,
    });
  }
  if (delivery.failureCode !== null) {
    return Object.freeze({
      status: "delivery-failed",
      failureCode: delivery.failureCode,
      respondedAt: null,
    });
  }
  return Object.freeze({
    status: "delivery-pending",
    failureCode: null,
    respondedAt: null,
  });
}

function timeline(events: readonly AttemptEvent[]): readonly TimelineEntry[] {
  return Object.freeze(
    events.map((event) =>
      Object.freeze({
        sequence: event.sequence,
        type: event.type,
        recordedAt: event.recordedAt,
        source:
          event.updateId === null
            ? ("sotto-journal" as const)
            : ("canton-ledger" as const),
        updateId: event.updateId,
      }),
    ),
  );
}

export type EvidenceInput = Readonly<{
  viewer: EvidenceViewer;
  publicRow: PublicAttemptRow;
  aggregate: PurchaseAggregateRow | null;
  events: readonly AttemptEvent[];
  settlement: SettlementFacts | null;
  delivery: DeliveryFacts | null;
  explorerBaseUrl: string | undefined;
}>;

/**
 * Q-004 projection matrix. The session owner sees full receipt fields; the
 * public sees the Sotto-attributed facts with private request/response
 * context withheld and each withheld field named with its reason. Both
 * views keep settlement and delivery as separate facts — they never merge
 * into a generic "success".
 */
export function projectAttemptEvidence(input: EvidenceInput): AttemptEvidence {
  const row = input.publicRow;
  const owner = input.viewer === "owner" ? input.aggregate : null;
  const receipt =
    owner === null
      ? null
      : Object.freeze({
          operationId: owner.operationId,
          requestCommitment: owner.requestCommitment,
          challengeId: owner.challengeId,
          purchaseCommitment: owner.purchaseCommitment,
          commandId: owner.commandId,
          preparedTransactionHash: owner.preparedTransactionHash,
          transferContextHash: owner.transferContextHash,
          sourceCommit: owner.sourceCommit,
          submissionId: input.settlement?.submissionId ?? null,
        });
  return Object.freeze({
    attemptId: row.attemptId,
    state: row.state,
    createdAt: row.createdAt,
    executeBefore: row.executeBefore,
    resource: Object.freeze({
      method: row.method,
      origin: row.normalizedOrigin,
      route: row.routeTemplate,
      name: row.resourceName,
    }),
    amount: Object.freeze({ atomic: row.amountAtomic, asset: row.asset }),
    settlement: settlementProjection(
      row.state,
      input.settlement,
      input.events,
      input.explorerBaseUrl,
    ),
    delivery: deliveryProjection(row.state, input.delivery),
    timeline: timeline(input.events),
    receipt,
    redactions:
      input.viewer === "public"
        ? Object.freeze([
            Object.freeze({ field: "request", reason: PRIVATE_REASON }),
            Object.freeze({ field: "response", reason: PRIVATE_REASON }),
            Object.freeze({ field: "receipt", reason: PRIVATE_REASON }),
          ])
        : Object.freeze([]),
  });
}
