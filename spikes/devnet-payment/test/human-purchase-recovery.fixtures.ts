import { vi, type Mock } from "vitest";
import { authenticateHumanPurchaseProviderSettlement } from "../src/human-purchase-provider-reconciliation.js";
import {
  initializeHumanPurchaseJournal,
  loadHumanPurchaseJournal,
  markHumanPurchaseApprovalRequested,
  markHumanPurchaseCompletion,
  markHumanPurchaseDelivery,
  markHumanPurchaseExecutionStarted,
  markHumanPurchaseSettlementReconciled,
  markHumanPurchaseSignatureVerified,
  withHumanPurchaseJournalLease,
} from "../src/human-purchase-journal.js";
import type { HumanPurchaseRecoveryDependencies } from "../src/human-purchase-recovery.js";
import { humanSettlementTransaction } from "./human-purchase-provider-reconciliation.fixtures.js";
import {
  HUMAN_JOURNAL_PREPARED_HASH,
  HUMAN_JOURNAL_SESSION,
  HUMAN_JOURNAL_UPDATE_ID,
  humanJournalSha,
  persistedHumanJournalExpectation,
} from "./human-purchase-journal.fixtures.js";

export const HUMAN_RECOVERY_SOURCE_COMMIT = "d".repeat(40);
export const HUMAN_RECOVERY_PROVIDER =
  persistedHumanJournalExpectation().expectation.providerParty;
export const HUMAN_RECOVERY_NETWORK = Object.freeze({
  audience: "validator-devnet-m2m",
  clientId: "validator-devnet-m2m",
  clientSecret: "secret",
  issuerUrl:
    "https://auth.sandbox.fivenorth.io/application/o/validator-devnet-m2m",
  ledgerUrl: "https://ledger-api.validator.devnet.sandbox.fivenorth.io",
  scope: "daml_ledger_api",
  tokenUrl: "https://auth.sandbox.fivenorth.io/application/o/token/",
  validatorUrl:
    "https://wallet.validator.devnet.sandbox.fivenorth.io/api/validator",
});

export async function createHumanRecoveryJournal(workspaceRoot: string) {
  const initialized = await initializeHumanPurchaseJournal({
    beginExclusive: 41,
    expectation: persistedHumanJournalExpectation(),
    sourceCommit: HUMAN_RECOVERY_SOURCE_COMMIT,
    workspaceRoot,
  });
  return {
    ...initialized,
    common: { operationId: initialized.operationId, workspaceRoot },
  };
}

export async function advanceHumanRecoveryJournal(
  workspaceRoot: string,
  stage:
    | "approval-requested"
    | "completion"
    | "delivery"
    | "execution-started"
    | "settlement-reconciled"
    | "signature-verified",
) {
  const journal = await createHumanRecoveryJournal(workspaceRoot);
  await markHumanPurchaseApprovalRequested({
    ...journal.common,
    sessionId: HUMAN_JOURNAL_SESSION,
  });
  if (stage === "approval-requested") return journal;
  await markHumanPurchaseSignatureVerified({
    ...journal.common,
    preparedTransactionHash: HUMAN_JOURNAL_PREPARED_HASH,
    sessionId: HUMAN_JOURNAL_SESSION,
  });
  if (stage === "signature-verified") return journal;
  await markHumanPurchaseExecutionStarted({
    ...journal.common,
    sessionId: HUMAN_JOURNAL_SESSION,
    submissionId: "123e4567-e89b-42d3-a456-426614174000",
    userId: "five-north-human-submitter",
  });
  if (stage === "execution-started") return journal;
  await markHumanPurchaseCompletion({
    ...journal.common,
    classification: "SUCCEEDED",
    completionOffset: 42,
    updateId: HUMAN_JOURNAL_UPDATE_ID,
  });
  if (stage === "completion") return journal;
  const state = await loadHumanPurchaseJournal(journal.common);
  const proof = Object.freeze({
    attemptId: state.expectation.attemptId,
    challengeId: state.expectation.challengeId,
    purchaseCommitment: state.expectation.purchaseCommitment,
    requestCommitment: state.expectation.requestCommitment,
    updateId: HUMAN_JOURNAL_UPDATE_ID,
  });
  const settlement = authenticateHumanPurchaseProviderSettlement(
    humanSettlementTransaction(state.expectation),
    proof,
    state.expectation,
  );
  await markHumanPurchaseSettlementReconciled({
    ...journal.common,
    settlement,
  });
  if (stage === "settlement-reconciled") return journal;
  await markHumanPurchaseDelivery({
    ...journal.common,
    bodyByteCount: 17,
    bodySha256: humanJournalSha("paid delivery"),
    status: 200,
  });
  return journal;
}

export function humanRecoveryDependencies(
  options: {
    completion?: "REJECTED" | "SUCCEEDED";
    mismatchedTransaction?: boolean;
  } = {},
): Readonly<{
  awaitCompletion: Mock;
  createCompletionTransport: Mock;
  createProviderTransactionReader: Mock;
  dependencies: HumanPurchaseRecoveryDependencies;
  readTransaction: Mock;
}> {
  const completion = options.completion ?? "SUCCEEDED";
  const awaitCompletion = vi.fn(async () =>
    completion === "SUCCEEDED"
      ? {
          classification: "SUCCEEDED" as const,
          completionOffset: 42,
          updateId: HUMAN_JOURNAL_UPDATE_ID,
        }
      : {
          classification: "REJECTED" as const,
          completionOffset: 42,
          statusCode: 7,
        },
  );
  const readTransaction = vi.fn(async () => {
    if (options.mismatchedTransaction) return {};
    throw new Error("expectation is supplied by recovery");
  });
  const createProviderTransactionReader = vi.fn(() => readTransaction);
  const createCompletionTransport = vi.fn(() => ({
    awaitCompletion,
    readLedgerEnd: vi.fn(),
  }));
  const dependencies: HumanPurchaseRecoveryDependencies = {
    authenticateProviderSettlement: authenticateHumanPurchaseProviderSettlement,
    createCompletionTransport,
    createProviderTransactionReader,
    loadJournal: loadHumanPurchaseJournal,
    markCompletion: markHumanPurchaseCompletion,
    markSettlementReconciled: markHumanPurchaseSettlementReconciled,
    withJournalLease: withHumanPurchaseJournalLease,
  };
  return {
    awaitCompletion,
    createCompletionTransport,
    createProviderTransactionReader,
    dependencies,
    readTransaction,
  };
}

export function humanRecoveryInput(workspaceRoot: string, operationId: string) {
  return {
    network: HUMAN_RECOVERY_NETWORK,
    operationId,
    providerParty: HUMAN_RECOVERY_PROVIDER,
    signal: new AbortController().signal,
    sourceCommit: HUMAN_RECOVERY_SOURCE_COMMIT,
    workspaceRoot,
  };
}
