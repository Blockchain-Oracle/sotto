import {
  reconciledEventHash,
  rejectedSettlementEventHash,
} from "./purchase-human-event.js";
import type {
  HumanEventTransitionRow,
  HumanTransitionState,
} from "./purchase-human-transition-types.js";
import { PurchasePersistenceError } from "./purchase-types.js";

const UPDATE_ID = /^1220[0-9a-f]{64}$/u;

export type HumanTerminalEvent = Readonly<{
  completionOffset: number;
  reconciliationOffset: number;
  reconciledAt: string;
  rejectionStatusCode: number | null;
  type: "settlement-reconciled" | "settlement-rejected";
  updateId: string | null;
}>;

function timestamp(value: Date | null): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new PurchasePersistenceError();
  }
  return value.toISOString();
}

function offset(value: string | null): number {
  if (value === null || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new PurchasePersistenceError();
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new PurchasePersistenceError();
  return parsed;
}

export function validateHumanTerminalEvent(
  event: HumanEventTransitionRow,
  previous: HumanEventTransitionRow,
  state: HumanTransitionState,
  expectationDigest: string,
): HumanTerminalEvent {
  const completionOffset = offset(event.completionOffset);
  const reconciliationOffset = offset(
    state.settlement?.reconciliationOffset ?? null,
  );
  const beginExclusive = offset(state.attempt.beginExclusive);
  const reconciledAt = timestamp(event.reconciledAt);
  const submissionId = state.attempt.submissionId;
  const executionUserId = state.attempt.executionUserId;
  if (
    event.attemptId !== state.attempt.attemptId ||
    event.sequence !== "6" ||
    event.previousEventHash !== previous.eventHash ||
    timestamp(event.recordedAt) !== reconciledAt ||
    event.preparedTransactionHash !== null ||
    event.transferContextHash !== null ||
    event.preparedVerifiedAt !== null ||
    event.sessionId !== null ||
    event.connectorKind !== null ||
    event.connectorId !== null ||
    event.decisionReason !== null ||
    event.signatureVerifiedAt !== null ||
    event.submissionId !== null ||
    event.executionUserId !== null ||
    event.executionStartedAt !== null ||
    submissionId === null ||
    executionUserId === null ||
    reconciliationOffset < beginExclusive ||
    completionOffset <= reconciliationOffset
  ) {
    throw new PurchasePersistenceError();
  }
  const common = {
    attemptId: state.attempt.attemptId,
    commandId: state.attempt.commandId,
    submissionId,
    executionUserId,
    expectationDigest,
    reconciliationOffset,
    completionOffset,
  };
  if (
    event.type === "settlement-reconciled" &&
    event.updateId !== null &&
    UPDATE_ID.test(event.updateId) &&
    event.rejectionStatusCode === null &&
    event.eventHash ===
      reconciledEventHash(
        { ...common, updateId: event.updateId },
        reconciledAt,
        previous.eventHash,
      )
  ) {
    return Object.freeze({
      completionOffset,
      reconciliationOffset,
      reconciledAt,
      rejectionStatusCode: null,
      type: event.type,
      updateId: event.updateId,
    });
  }
  if (
    event.type === "settlement-rejected" &&
    event.updateId === null &&
    event.rejectionStatusCode !== null &&
    Number.isInteger(event.rejectionStatusCode) &&
    event.rejectionStatusCode >= 1 &&
    event.rejectionStatusCode <= 16 &&
    event.eventHash ===
      rejectedSettlementEventHash(
        { ...common, statusCode: event.rejectionStatusCode },
        reconciledAt,
        previous.eventHash,
      )
  ) {
    return Object.freeze({
      completionOffset,
      reconciliationOffset,
      reconciledAt,
      rejectionStatusCode: event.rejectionStatusCode,
      type: event.type,
      updateId: null,
    });
  }
  throw new PurchasePersistenceError();
}
