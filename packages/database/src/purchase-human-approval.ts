import type { Pool } from "pg";
import {
  approvalEventHash,
  decisionEventHash,
  transitionResult,
} from "./purchase-human-event.js";
import { lockHumanTransitionState } from "./purchase-human-transition-row.js";
import type { HumanEventTransitionRow } from "./purchase-human-transition-types.js";
import {
  approvalTransitionInput,
  walletDecisionInput,
} from "./purchase-human-transition-validation.js";
import { validateHumanTransitionState } from "./purchase-human-state-oracle.js";
import { purchaseTransaction } from "./purchase-transaction.js";
import {
  PurchaseConflictError,
  PurchasePersistenceError,
  type HumanPurchaseTransitionResult,
} from "./purchase-types.js";

type Approval = ReturnType<typeof approvalTransitionInput>;
type Decision = ReturnType<typeof walletDecisionInput>;

function matchesApproval(
  event: HumanEventTransitionRow,
  input: Approval,
  preparedTransactionHash: string | null,
): boolean {
  return (
    preparedTransactionHash === input.preparedTransactionHash &&
    event.attemptId === input.attemptId &&
    event.type === "approval-requested" &&
    event.connectorKind === input.connectorKind &&
    event.connectorId === input.connectorId &&
    event.sessionId === input.sessionId
  );
}

function matchesDecision(
  event: HumanEventTransitionRow,
  input: Decision,
  preparedTransactionHash: string | null,
): boolean {
  return (
    preparedTransactionHash === input.preparedTransactionHash &&
    event.attemptId === input.attemptId &&
    event.type === `wallet-${input.outcome}` &&
    event.connectorKind === input.connectorKind &&
    event.connectorId === input.connectorId &&
    event.sessionId ===
      (input.outcome === "rejected" ? input.sessionId : null) &&
    event.decisionReason === input.reason
  );
}

export async function recordApprovalRequested(
  pool: Pool,
  candidate: unknown,
): Promise<HumanPurchaseTransitionResult> {
  const input = approvalTransitionInput(candidate);
  return purchaseTransaction(pool, async (client) => {
    const state = await lockHumanTransitionState(client, input.attemptId);
    const journal = await validateHumanTransitionState(client, state);
    const replay = journal.event("approval-requested");
    if (replay !== undefined) {
      if (
        !matchesApproval(replay, input, state.attempt.preparedTransactionHash)
      ) {
        throw new PurchaseConflictError();
      }
      return transitionResult(replay, "replayed");
    }
    if (
      state.attempt.state !== "prepared-hash-verified" ||
      !journal.executionEligible ||
      state.attempt.preparedTransactionHash !== input.preparedTransactionHash ||
      state.databaseNow.getTime() >= state.attempt.executeBefore.getTime()
    ) {
      throw new PurchaseConflictError();
    }
    const recordedAt = state.databaseNow.toISOString();
    const eventHash = approvalEventHash(
      input,
      recordedAt,
      journal.latest.eventHash,
    );
    const event = await client.query(
      `INSERT INTO sotto.attempt_events
        (attempt_id, sequence, event_type, event_hash, previous_event_hash,
         wallet_session_id, wallet_connector_kind, wallet_connector_id,
         recorded_at)
       VALUES ($1, 3, 'approval-requested', $2, $3, $4, $5, $6, $7)`,
      [
        input.attemptId,
        eventHash,
        journal.latest.eventHash,
        input.sessionId,
        input.connectorKind,
        input.connectorId,
        recordedAt,
      ],
    );
    const attempt = await client.query(
      `UPDATE sotto.purchase_attempts
       SET state = 'approval-requested', wallet_session_id = $2,
         wallet_connector_kind = $3, wallet_connector_id = $4,
         approval_requested_at = $5
       WHERE attempt_id = $1 AND state = 'prepared-hash-verified'
         AND clock_timestamp() < execute_before`,
      [
        input.attemptId,
        input.sessionId,
        input.connectorKind,
        input.connectorId,
        recordedAt,
      ],
    );
    if (event.rowCount !== 1 || attempt.rowCount !== 1) {
      throw new PurchasePersistenceError();
    }
    const created = await lockHumanTransitionState(client, input.attemptId);
    const verified = await validateHumanTransitionState(client, created);
    return transitionResult(verified.event("approval-requested")!, "created");
  });
}

export async function recordWalletDecision(
  pool: Pool,
  candidate: unknown,
): Promise<HumanPurchaseTransitionResult> {
  const input = walletDecisionInput(candidate);
  return purchaseTransaction(pool, async (client) => {
    const state = await lockHumanTransitionState(client, input.attemptId);
    const journal = await validateHumanTransitionState(client, state);
    const type = `wallet-${input.outcome}`;
    const replay = journal.event(type);
    if (replay !== undefined) {
      if (
        !matchesDecision(replay, input, state.attempt.preparedTransactionHash)
      ) {
        throw new PurchaseConflictError();
      }
      return transitionResult(replay, "replayed");
    }
    const prior =
      input.outcome === "rejected"
        ? journal.event("approval-requested")
        : journal.latest;
    if (
      !journal.executionEligible ||
      state.attempt.preparedTransactionHash !== input.preparedTransactionHash ||
      prior === undefined ||
      (input.outcome === "rejected" &&
        !matchesApproval(
          prior,
          input as Approval,
          state.attempt.preparedTransactionHash,
        )) ||
      (input.outcome === "unsupported" &&
        state.attempt.state !== "prepared-hash-verified")
    ) {
      throw new PurchaseConflictError();
    }
    const recordedAt = state.databaseNow.toISOString();
    const eventHash = decisionEventHash(
      input,
      recordedAt,
      journal.latest.eventHash,
    );
    const sequence = input.outcome === "rejected" ? 4 : 3;
    const event = await client.query(
      `INSERT INTO sotto.attempt_events
        (attempt_id, sequence, event_type, event_hash, previous_event_hash,
         wallet_session_id, wallet_connector_kind, wallet_connector_id,
         wallet_decision_reason, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.attemptId,
        sequence,
        type,
        eventHash,
        journal.latest.eventHash,
        input.outcome === "rejected" ? input.sessionId : null,
        input.connectorKind,
        input.connectorId,
        input.reason,
        recordedAt,
      ],
    );
    const expectedState =
      input.outcome === "rejected"
        ? "approval-requested"
        : "prepared-hash-verified";
    const attempt = await client.query(
      `UPDATE sotto.purchase_attempts
       SET state = $2, wallet_connector_kind = $3, wallet_connector_id = $4,
         wallet_session_id = $5, wallet_decision_reason = $6,
         wallet_decided_at = $7
       WHERE attempt_id = $1 AND state = $8`,
      [
        input.attemptId,
        type,
        input.connectorKind,
        input.connectorId,
        input.outcome === "rejected" ? input.sessionId : null,
        input.reason,
        recordedAt,
        expectedState,
      ],
    );
    if (event.rowCount !== 1 || attempt.rowCount !== 1) {
      throw new PurchasePersistenceError();
    }
    const created = await lockHumanTransitionState(client, input.attemptId);
    const verified = await validateHumanTransitionState(client, created);
    return transitionResult(verified.event(type)!, "created");
  });
}
