import { describe, expect, it } from "vitest";
import type { PurchaseAggregateRow } from "@sotto/database";
import { projectAttemptEvidence } from "../src/services/evidence-projection.js";
import type {
  AttemptEvent,
  PublicAttemptRow,
} from "../src/services/purchase-reads.js";

const ATTEMPT_ID = `sha256:${"e".repeat(64)}`;
const UPDATE_ID = `1220${"9".repeat(64)}`;

function publicRow(state: string): PublicAttemptRow {
  return Object.freeze({
    attemptId: ATTEMPT_ID,
    state,
    createdAt: "2026-07-19T00:00:00.000Z",
    executeBefore: "2026-07-19T00:10:00.000Z",
    method: "GET",
    routeTemplate: "/weather/current",
    normalizedOrigin: "https://weather.example.com",
    resourceName: "Current weather",
    amountAtomic: "2500000000",
    asset: "CC",
  });
}

function aggregate(state: string): PurchaseAggregateRow {
  return {
    attemptId: ATTEMPT_ID,
    operationId: `sha256:${"1".repeat(64)}`,
    requestHash: "2".repeat(64),
    ownerId: "owner-1",
    resourceRevisionId: "rev-1",
    authorizationMode: "human-wallet",
    commitmentVersion: "sotto-human-purchase-v1",
    requestCommitment: `sha256:${"3".repeat(64)}`,
    challengeId: `sha256:${"4".repeat(64)}`,
    purchaseCommitment: `sha256:${"5".repeat(64)}`,
    commandId: `sotto-human-purchase-v1-${"5".repeat(64)}`,
    beginExclusive: "42",
    executeBefore: new Date("2026-07-19T00:10:00.000Z"),
    sourceCommit: "cfe1a6386fb555b6e081cc1dc6480527ce5e9b56",
    state,
    createdAt: new Date("2026-07-19T00:00:00.000Z"),
    preparedTransactionHash: null,
    transferContextHash: null,
    preparedVerifiedAt: null,
  } as unknown as PurchaseAggregateRow;
}

const events: readonly AttemptEvent[] = Object.freeze([
  {
    sequence: 1,
    type: "intent-created",
    recordedAt: "2026-07-19T00:00:00.000Z",
    updateId: null,
  },
  {
    sequence: 6,
    type: "settlement-reconciled",
    recordedAt: "2026-07-19T00:05:00.000Z",
    updateId: UPDATE_ID,
  },
]);

describe("evidence projection (Q-004)", () => {
  it("redacts private context for the public and names each veil", () => {
    const projected = projectAttemptEvidence({
      viewer: "public",
      publicRow: publicRow("settlement-reconciled"),
      aggregate: aggregate("settlement-reconciled"),
      events,
      settlement: {
        state: "settled",
        updateId: UPDATE_ID,
        submissionId: "sub-1",
        executionStartedAt: "2026-07-19T00:04:00.000Z",
      },
      delivery: null,
      explorerBaseUrl: "https://explorer.example.com",
    });
    expect(projected.receipt).toBeNull();
    expect(projected.redactions).toHaveLength(3);
    expect(projected.redactions[0]).toMatchObject({
      reason: "Private resource context",
    });
    expect(projected.settlement).toEqual({
      status: "settled",
      updateId: UPDATE_ID,
      explorerUrl: `https://explorer.example.com/updates/${UPDATE_ID}`,
    });
    // Settlement and delivery stay separate facts: settled with pending
    // delivery never collapses into a generic success.
    expect(projected.delivery.status).toBe("delivery-pending");
    expect(projected.timeline.map((entry) => entry.source)).toEqual([
      "sotto-journal",
      "canton-ledger",
    ]);
  });

  it("gives the owner the full receipt including the submission ID", () => {
    const projected = projectAttemptEvidence({
      viewer: "owner",
      publicRow: publicRow("settlement-reconciled"),
      aggregate: aggregate("settlement-reconciled"),
      events,
      settlement: {
        state: "settled",
        updateId: UPDATE_ID,
        submissionId: "sub-1",
        executionStartedAt: "2026-07-19T00:04:00.000Z",
      },
      delivery: {
        claimState: "completed",
        failureCode: null,
        responseStatus: 200,
        bodyByteCount: 512,
        bodySha256: `sha256:${"6".repeat(64)}`,
        respondedAt: "2026-07-19T00:06:00.000Z",
      },
      explorerBaseUrl: undefined,
    });
    expect(projected.redactions).toHaveLength(0);
    expect(projected.receipt).toMatchObject({
      requestCommitment: `sha256:${"3".repeat(64)}`,
      submissionId: "sub-1",
    });
    expect(projected.delivery.status).toBe("delivered");
    // Explorer indexing not configured: the update ID is still present,
    // the link is null, and nothing renders as failure.
    expect(projected.settlement.updateId).toBe(UPDATE_ID);
    expect(projected.settlement.explorerUrl).toBeNull();
  });

  it("keeps a pending settlement pending, never failed", () => {
    const projected = projectAttemptEvidence({
      viewer: "public",
      publicRow: publicRow("execution-started"),
      aggregate: null,
      events: [events[0]!],
      settlement: {
        state: "execution-started",
        updateId: null,
        submissionId: "sub-1",
        executionStartedAt: "2026-07-19T00:04:00.000Z",
      },
      delivery: null,
      explorerBaseUrl: undefined,
    });
    expect(projected.settlement.status).toBe("settlement-pending");
    expect(projected.delivery.status).toBe("not-started");
  });

  it("reports a rejected wallet as not-submitted settlement", () => {
    const projected = projectAttemptEvidence({
      viewer: "public",
      publicRow: publicRow("wallet-rejected"),
      aggregate: null,
      events: [events[0]!],
      settlement: null,
      delivery: null,
      explorerBaseUrl: undefined,
    });
    expect(projected.settlement.status).toBe("not-submitted");
  });
});
