import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  approvalEventHash,
  decisionEventHash,
  executionEventHash,
  signatureEventHash,
} from "./purchase-human-event.js";
import type {
  HumanEventTransitionRow,
  HumanTransitionState,
} from "./purchase-human-transition-types.js";
import { legacyPreparedEventHash } from "./purchase-prepare-event.js";
import { readStoredSettlementAuthority } from "./purchase-settlement-row.js";
import { PurchasePersistenceError } from "./purchase-types.js";

export type HumanJournalOracle = Readonly<{
  event(type: string): HumanEventTransitionRow | undefined;
  executionEligible: boolean;
  latest: HumanEventTransitionRow;
}>;

function iso(value: Date | null): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new PurchasePersistenceError();
  }
  return value.toISOString();
}

function initialHash(requestHash: string): string {
  return `sha256:${createHash("sha256")
    .update(`sotto-purchase-intent-event-v1\0${requestHash}`, "utf8")
    .digest("hex")}`;
}

function requireBase(
  event: HumanEventTransitionRow,
  state: HumanTransitionState,
  sequence: number,
  previous: HumanEventTransitionRow | null,
): void {
  if (
    event.attemptId !== state.attempt.attemptId ||
    event.sequence !== String(sequence) ||
    event.previousEventHash !== (previous?.eventHash ?? null)
  ) {
    throw new PurchasePersistenceError();
  }
  iso(event.recordedAt);
}

function validateApproval(
  event: HumanEventTransitionRow,
  state: HumanTransitionState,
  previous: HumanEventTransitionRow,
): void {
  const recordedAt = iso(event.recordedAt);
  if (
    event.sessionId === null ||
    event.connectorKind === null ||
    event.connectorId === null ||
    event.decisionReason !== null ||
    event.eventHash !==
      approvalEventHash(
        {
          attemptId: state.attempt.attemptId,
          preparedTransactionHash: state.attempt.preparedTransactionHash!,
          connectorKind: event.connectorKind,
          connectorId: event.connectorId,
          sessionId: event.sessionId,
        },
        recordedAt,
        previous.eventHash,
      )
  ) {
    throw new PurchasePersistenceError();
  }
}

function validateDecision(
  event: HumanEventTransitionRow,
  state: HumanTransitionState,
  previous: HumanEventTransitionRow,
  outcome: "rejected" | "unsupported",
): void {
  const recordedAt = iso(event.recordedAt);
  if (
    event.connectorKind === null ||
    event.connectorId === null ||
    event.decisionReason === null ||
    (outcome === "rejected" && event.sessionId === null) ||
    (outcome === "unsupported" && event.sessionId !== null) ||
    event.eventHash !==
      decisionEventHash(
        {
          attemptId: state.attempt.attemptId,
          preparedTransactionHash: state.attempt.preparedTransactionHash!,
          connectorKind: event.connectorKind,
          connectorId: event.connectorId,
          outcome,
          reason: event.decisionReason,
          ...(event.sessionId === null ? {} : { sessionId: event.sessionId }),
        },
        recordedAt,
        previous.eventHash,
      )
  ) {
    throw new PurchasePersistenceError();
  }
}

function validateSignature(
  event: HumanEventTransitionRow,
  state: HumanTransitionState,
  previous: HumanEventTransitionRow,
): void {
  const recordedAt = iso(event.recordedAt);
  const verifiedAt = iso(event.signatureVerifiedAt);
  if (
    event.sessionId === null ||
    event.connectorKind === null ||
    event.connectorId === null ||
    Date.parse(verifiedAt) > Date.parse(recordedAt) ||
    event.eventHash !==
      signatureEventHash(
        {
          attemptId: state.attempt.attemptId,
          preparedTransactionHash: state.attempt.preparedTransactionHash!,
          connectorKind: event.connectorKind,
          connectorId: event.connectorId,
          sessionId: event.sessionId,
          verifiedAt,
        },
        recordedAt,
        previous.eventHash,
      )
  ) {
    throw new PurchasePersistenceError();
  }
}

function validateExecution(
  event: HumanEventTransitionRow,
  state: HumanTransitionState,
  previous: HumanEventTransitionRow,
): void {
  const recordedAt = iso(event.recordedAt);
  if (
    event.sessionId === null ||
    event.submissionId === null ||
    event.executionUserId === null ||
    iso(event.executionStartedAt) !== recordedAt ||
    event.eventHash !==
      executionEventHash(
        {
          attemptId: state.attempt.attemptId,
          commandId: state.attempt.commandId,
          preparedTransactionHash: state.attempt.preparedTransactionHash!,
          sessionId: event.sessionId,
          submissionId: event.submissionId,
          userId: event.executionUserId,
        },
        recordedAt,
        previous.eventHash,
      )
  ) {
    throw new PurchasePersistenceError();
  }
}

export async function validateHumanJournal(
  client: PoolClient,
  state: HumanTransitionState,
): Promise<HumanJournalOracle> {
  const { events, attempt } = state;
  if (events.length < 2 || events.length > 5)
    throw new PurchasePersistenceError();
  const initial = events[0]!;
  requireBase(initial, state, 1, null);
  if (
    initial.type !== "intent-created" ||
    initial.eventHash !== initialHash(attempt.requestHash)
  ) {
    throw new PurchasePersistenceError();
  }
  const prepared = events[1]!;
  requireBase(prepared, state, 2, initial);
  const storedSettlement = await readStoredSettlementAuthority(
    client,
    attempt.attemptId,
  );
  const verifiedAt = iso(attempt.preparedVerifiedAt);
  const expectedPreparedHash =
    storedSettlement?.eventHash ??
    legacyPreparedEventHash({
      attemptId: attempt.attemptId,
      preparedTransactionHash: attempt.preparedTransactionHash!,
      transferContextHash: attempt.transferContextHash!,
      verifiedAt,
      previousEventHash: initial.eventHash,
    });
  if (
    prepared.type !== "prepared-hash-verified" ||
    prepared.eventHash !== expectedPreparedHash ||
    prepared.preparedTransactionHash !== attempt.preparedTransactionHash ||
    prepared.transferContextHash !== attempt.transferContextHash ||
    iso(prepared.preparedVerifiedAt) !== verifiedAt ||
    (events.length > 2 && storedSettlement === null)
  ) {
    throw new PurchasePersistenceError();
  }
  for (let index = 2; index < events.length; index += 1) {
    const event = events[index]!;
    const previous = events[index - 1]!;
    requireBase(event, state, index + 1, previous);
    if (index === 2 && event.type === "approval-requested") {
      validateApproval(event, state, previous);
    } else if (index === 2 && event.type === "wallet-unsupported") {
      validateDecision(event, state, previous, "unsupported");
    } else if (index === 3 && event.type === "wallet-rejected") {
      validateDecision(event, state, previous, "rejected");
    } else if (index === 3 && event.type === "signature-verified") {
      validateSignature(event, state, previous);
    } else if (index === 4 && event.type === "execution-started") {
      validateExecution(event, state, previous);
    } else {
      throw new PurchasePersistenceError();
    }
  }
  const latest = events.at(-1)!;
  return Object.freeze({
    event: (type: string) =>
      events.find((candidate) => candidate.type === type),
    executionEligible: storedSettlement !== null,
    latest,
  });
}
