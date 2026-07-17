import { createFiveNorthHumanProviderTransactionReader } from "./five-north-human-provider-transaction.js";
import { createFiveNorthHumanWalletCompletionTransport } from "./five-north-human-wallet-completion.js";
import { approveFiveNorthPrepareNetwork } from "./five-north-prepare-network.js";
import {
  loadHumanPurchaseJournal,
  markHumanPurchaseCompletion,
  markHumanPurchaseSettlementReconciled,
  withHumanPurchaseJournalLease,
} from "./human-purchase-journal.js";
import { humanJournalSourceCommit } from "./human-purchase-journal-primitives.js";
import type {
  HumanPurchaseCompletionPayload,
  HumanPurchaseJournalStage,
  HumanPurchaseJournalState,
} from "./human-purchase-journal-types.js";
import { authenticateHumanPurchaseProviderSettlement } from "./human-purchase-provider-reconciliation.js";
import type {
  HumanPurchaseRecoveryInput,
  HumanPurchaseRecoveryResult,
} from "./human-purchase-recovery-types.js";

export type {
  HumanPurchaseRecoveryInput,
  HumanPurchaseRecoveryResult,
} from "./human-purchase-recovery-types.js";

export type HumanPurchaseRecoveryDependencies = Readonly<{
  authenticateProviderSettlement: typeof authenticateHumanPurchaseProviderSettlement;
  createCompletionTransport: typeof createFiveNorthHumanWalletCompletionTransport;
  createProviderTransactionReader: typeof createFiveNorthHumanProviderTransactionReader;
  loadJournal: typeof loadHumanPurchaseJournal;
  markCompletion: typeof markHumanPurchaseCompletion;
  markSettlementReconciled: typeof markHumanPurchaseSettlementReconciled;
  withJournalLease: typeof withHumanPurchaseJournalLease;
}>;

const HUMAN_PURCHASE_RECOVERY_DEPENDENCIES: HumanPurchaseRecoveryDependencies =
  Object.freeze({
    authenticateProviderSettlement: authenticateHumanPurchaseProviderSettlement,
    createCompletionTransport: createFiveNorthHumanWalletCompletionTransport,
    createProviderTransactionReader:
      createFiveNorthHumanProviderTransactionReader,
    loadJournal: loadHumanPurchaseJournal,
    markCompletion: markHumanPurchaseCompletion,
    markSettlementReconciled: markHumanPurchaseSettlementReconciled,
    withJournalLease: withHumanPurchaseJournalLease,
  });

function validateAuthority(
  input: HumanPurchaseRecoveryInput,
  state: HumanPurchaseJournalState,
): void {
  if (state.sourceCommit !== input.sourceCommit) {
    throw new Error("human purchase recovery source commit does not match");
  }
  if (state.expectation.providerParty !== input.providerParty) {
    throw new Error("human purchase recovery provider does not match");
  }
}

function result(
  state: HumanPurchaseJournalState,
  priorStage: HumanPurchaseJournalStage,
): HumanPurchaseRecoveryResult | null {
  const common = { operationId: state.operationId, priorStage } as const;
  if (state.delivery !== null) {
    if (
      state.completion?.classification !== "SUCCEEDED" ||
      state.settlementReconciled === null
    ) {
      throw new Error("human purchase recovery delivery state is invalid");
    }
    return Object.freeze({
      ...common,
      completion: state.completion,
      delivery: state.delivery,
      settlement: state.settlementReconciled,
      status: "delivered" as const,
    });
  }
  if (state.settlementReconciled !== null) {
    if (state.completion?.classification !== "SUCCEEDED") {
      throw new Error("human purchase recovery settlement state is invalid");
    }
    return Object.freeze({
      ...common,
      completion: state.completion,
      settlement: state.settlementReconciled,
      status: "settled-undelivered" as const,
    });
  }
  if (state.completion?.classification === "REJECTED") {
    return Object.freeze({
      ...common,
      completion: state.completion,
      status: "rejected" as const,
    });
  }
  if (state.executionStarted === null) {
    return Object.freeze({ ...common, status: "not-executed" as const });
  }
  return null;
}

async function persistCompletion(
  input: HumanPurchaseRecoveryInput,
  dependencies: HumanPurchaseRecoveryDependencies,
  state: HumanPurchaseJournalState,
  completion: HumanPurchaseCompletionPayload,
  assertOwned: () => Promise<void>,
): Promise<void> {
  await assertOwned();
  await dependencies.markCompletion({
    ...completion,
    operationId: state.operationId,
    workspaceRoot: input.workspaceRoot,
  });
}

export async function recoverHumanPurchase(
  input: HumanPurchaseRecoveryInput,
  dependencies: HumanPurchaseRecoveryDependencies = HUMAN_PURCHASE_RECOVERY_DEPENDENCIES,
): Promise<HumanPurchaseRecoveryResult> {
  if (!(input.signal instanceof AbortSignal)) {
    throw new Error("human purchase recovery requires an AbortSignal");
  }
  if (input.signal.aborted) {
    throw new Error("human purchase recovery was cancelled");
  }
  humanJournalSourceCommit(input.sourceCommit);
  const network = approveFiveNorthPrepareNetwork(input.network);
  return dependencies.withJournalLease({
    operationId: input.operationId,
    workspaceRoot: input.workspaceRoot,
    action: async (assertOwned) => {
      const state = await dependencies.loadJournal(input);
      validateAuthority(input, state);
      const priorStage = state.stage;
      const durable = result(state, priorStage);
      if (durable !== null) return durable;
      let completion = state.completion;
      if (completion === null) {
        completion = await dependencies
          .createCompletionTransport(network, state.expectation.payerParty, {
            signal: input.signal,
          })
          .awaitCompletion({
            beginExclusive: state.beginExclusive,
            commandId: state.expectation.commandId,
            userId: state.executionStarted!.userId,
          });
        await persistCompletion(
          input,
          dependencies,
          state,
          completion,
          assertOwned,
        );
        if (completion.classification === "REJECTED") {
          return result(await dependencies.loadJournal(input), priorStage)!;
        }
      }
      if (completion.classification !== "SUCCEEDED") {
        throw new Error("human purchase recovery completion is invalid");
      }
      const proof = Object.freeze({
        attemptId: state.expectation.attemptId,
        challengeId: state.expectation.challengeId,
        purchaseCommitment: state.expectation.purchaseCommitment,
        requestCommitment: state.expectation.requestCommitment,
        updateId: completion.updateId,
      });
      const readTransaction = dependencies.createProviderTransactionReader(
        network,
        input.providerParty,
        { signal: input.signal },
      );
      const settlement = dependencies.authenticateProviderSettlement(
        await readTransaction(completion.updateId),
        proof,
        state.expectation,
      );
      await assertOwned();
      await dependencies.markSettlementReconciled({
        operationId: state.operationId,
        settlement,
        workspaceRoot: input.workspaceRoot,
      });
      return result(await dependencies.loadJournal(input), priorStage)!;
    },
  });
}
