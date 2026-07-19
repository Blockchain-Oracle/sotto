import type { Pool } from "pg";
import { sha256 } from "./publication-validation-primitives.js";
import { lockHumanTransitionState } from "./purchase-human-transition-row.js";
import { validateHumanTransitionState } from "./purchase-human-state-oracle.js";
import { purchaseTransaction } from "./purchase-transaction.js";
import {
  PurchasePersistenceError,
  type HumanPurchaseLifecycle,
  type HumanWalletConnectorKind,
} from "./purchase-types.js";

function connectorKind(value: string | null): HumanWalletConnectorKind | null {
  if (value === null || value === "openrpc" || value === "wallet-sdk") {
    return value;
  }
  throw new PurchasePersistenceError();
}

export async function readHumanLifecycle(
  pool: Pool,
  candidateAttemptId: unknown,
): Promise<HumanPurchaseLifecycle> {
  const attemptId = sha256(candidateAttemptId, "human lifecycle attempt ID");
  return purchaseTransaction(pool, async (client) => {
    const state = await lockHumanTransitionState(client, attemptId);
    const journal = await validateHumanTransitionState(client, state);
    const attempt = state.attempt;
    if (attempt.preparedTransactionHash === null) {
      throw new PurchasePersistenceError();
    }
    return Object.freeze({
      attemptId,
      commandId: attempt.commandId,
      state: attempt.state,
      preparedTransactionHash:
        attempt.preparedTransactionHash as `sha256:${string}`,
      connectorId: attempt.connectorId,
      connectorKind: connectorKind(attempt.connectorKind),
      sessionId: attempt.sessionId as `sha256:${string}` | null,
      submissionId: attempt.submissionId,
      userId: attempt.executionUserId,
      latestEventSequence: Number(journal.latest.sequence),
      latestEventType: journal.latest.type,
    });
  });
}
