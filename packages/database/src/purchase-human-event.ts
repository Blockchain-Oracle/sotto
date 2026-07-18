import { createHash } from "node:crypto";
import type { HumanEventTransitionRow } from "./purchase-human-transition-types.js";
import {
  PurchasePersistenceError,
  type HumanPurchaseTransitionResult,
} from "./purchase-types.js";

export function humanTransitionEventHash(
  version: string,
  fields: readonly string[],
): `sha256:${string}` {
  const body = [version, ...fields].join("\0");
  return `sha256:${createHash("sha256").update(body, "utf8").digest("hex")}`;
}

export function approvalEventHash(
  input: Readonly<{
    attemptId: string;
    preparedTransactionHash: string;
    connectorKind: string;
    connectorId: string;
    sessionId: string;
  }>,
  recordedAt: string,
  previous: string,
): `sha256:${string}` {
  return humanTransitionEventHash("sotto-human-approval-requested-event-v2", [
    input.attemptId,
    input.preparedTransactionHash,
    input.connectorKind,
    input.connectorId,
    input.sessionId,
    recordedAt,
    previous,
  ]);
}

export function decisionEventHash(
  input: Readonly<{
    attemptId: string;
    preparedTransactionHash: string;
    connectorKind: string;
    connectorId: string;
    outcome: string;
    reason: string;
    sessionId?: string;
  }>,
  recordedAt: string,
  previous: string,
): `sha256:${string}` {
  return humanTransitionEventHash(
    input.outcome === "rejected"
      ? "sotto-human-wallet-rejected-event-v2"
      : "sotto-human-wallet-unsupported-event-v2",
    [
      input.attemptId,
      input.preparedTransactionHash,
      input.connectorKind,
      input.connectorId,
      ...(input.sessionId === undefined ? [] : [input.sessionId]),
      input.reason,
      recordedAt,
      previous,
    ],
  );
}

export function signatureEventHash(
  input: Readonly<{
    attemptId: string;
    preparedTransactionHash: string;
    connectorKind: string;
    connectorId: string;
    sessionId: string;
    verifiedAt: string;
  }>,
  recordedAt: string,
  previous: string,
): `sha256:${string}` {
  return humanTransitionEventHash("sotto-human-signature-verified-event-v2", [
    input.attemptId,
    input.preparedTransactionHash,
    input.connectorKind,
    input.connectorId,
    input.sessionId,
    input.verifiedAt,
    recordedAt,
    previous,
  ]);
}

export function executionEventHash(
  input: Readonly<{
    attemptId: string;
    commandId: string;
    preparedTransactionHash: string;
    sessionId: string;
    submissionId: string;
    userId: string;
  }>,
  recordedAt: string,
  previous: string,
): `sha256:${string}` {
  return humanTransitionEventHash("sotto-human-execution-started-event-v2", [
    input.attemptId,
    input.commandId,
    input.preparedTransactionHash,
    input.sessionId,
    input.submissionId,
    input.userId,
    recordedAt,
    previous,
  ]);
}

export function reconcileJobDedupe(
  attemptId: string,
  executionEventHash: string,
): `sha256:${string}` {
  return humanTransitionEventHash("sotto-purchase-reconcile-job-v1", [
    attemptId,
    executionEventHash,
  ]);
}

export function transitionResult(
  event: HumanEventTransitionRow,
  outcome: "created" | "replayed",
): HumanPurchaseTransitionResult {
  const sequence = Number(event.sequence);
  if (
    (sequence !== 3 && sequence !== 4 && sequence !== 5) ||
    event.previousEventHash === null
  ) {
    throw new PurchasePersistenceError();
  }
  return Object.freeze({
    outcome,
    attemptId: event.attemptId as `sha256:${string}`,
    state: event.type as HumanPurchaseTransitionResult["state"],
    event: Object.freeze({
      sequence,
      type: event.type,
      eventHash: event.eventHash as `sha256:${string}`,
      previousEventHash: event.previousEventHash as `sha256:${string}`,
      recordedAt: event.recordedAt.toISOString(),
    }),
  });
}
