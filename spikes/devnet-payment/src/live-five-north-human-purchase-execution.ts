import type { HumanSettlementExpectation } from "@sotto/x402-canton";
import type { FiveNorthHumanProviderSession } from "./five-north-human-provider-session.js";
import type { FiveNorthInteractiveHumanWallet } from "./five-north-interactive-human-wallet.js";
import type { PreparedHumanPurchaseAuthority } from "./prepare-human-purchase-authority.js";
import type { LiveFiveNorthHumanPurchaseDependencies } from "./live-five-north-human-purchase-dependencies.js";
import type { LiveFiveNorthHumanPurchaseInput } from "./live-five-north-human-purchase.js";
import {
  type createDeferredHumanSettlementVerifier,
  humanPurchaseSettlementProof,
  paidHumanPurchaseProof,
  readExactHumanPaidDelivery,
} from "./live-five-north-human-purchase-settlement.js";

type CompletionTransport = ReturnType<
  LiveFiveNorthHumanPurchaseDependencies["createCompletionTransport"]
>;
type DeferredVerifier = ReturnType<
  typeof createDeferredHumanSettlementVerifier
>;
type Journal = Awaited<
  ReturnType<LiveFiveNorthHumanPurchaseDependencies["initializeJournal"]>
>;

export function executeLiveFiveNorthHumanPurchase(input: {
  beginExclusive: number;
  completion: CompletionTransport;
  deferred: DeferredVerifier;
  dependencies: LiveFiveNorthHumanPurchaseDependencies;
  expectation: HumanSettlementExpectation;
  journal: Journal;
  liveInput: LiveFiveNorthHumanPurchaseInput;
  prepared: PreparedHumanPurchaseAuthority;
  provider: FiveNorthHumanProviderSession;
  readTransaction: (updateId: string) => Promise<unknown>;
  signal: AbortSignal;
  wallet: FiveNorthInteractiveHumanWallet;
}) {
  const { dependencies, expectation, journal, liveInput } = input;
  return dependencies.withJournalLease({
    operationId: journal.operationId,
    workspaceRoot: liveInput.workspaceRoot,
    action: async (assertOwned) => {
      await assertOwned();
      const signing = await dependencies.createSigningSession(
        {
          preflight: input.prepared.preflight,
          prepared: input.prepared.verified,
        },
        { resolveRegisteredPublicKey: input.wallet.resolveRegisteredPublicKey },
        {
          signal: input.signal,
          onApprovalRequested: ({ sessionId }) =>
            dependencies.markApprovalRequested({
              operationId: journal.operationId,
              sessionId,
              workspaceRoot: liveInput.workspaceRoot,
            }),
        },
      );
      if (signing.outcome !== "verified") {
        return Object.freeze({
          operationId: journal.operationId,
          reason: signing.reason,
          status:
            signing.outcome === "rejected"
              ? ("wallet-rejected" as const)
              : ("wallet-unsupported" as const),
        });
      }
      await dependencies.markSignatureVerified({
        operationId: journal.operationId,
        preparedTransactionHash: signing.preparedTransactionHash,
        sessionId: signing.sessionId,
        workspaceRoot: liveInput.workspaceRoot,
      });
      await assertOwned();
      const submitted = await dependencies
        .createExecuteTransport(liveInput.network, { signal: input.signal })
        .execute(signing, (started) =>
          dependencies.markExecutionStarted({
            operationId: journal.operationId,
            ...started,
            workspaceRoot: liveInput.workspaceRoot,
          }),
        );
      const terminal = await input.completion.awaitCompletion({
        beginExclusive: input.beginExclusive,
        commandId: expectation.commandId,
        userId: submitted.userId,
      });
      await dependencies.markCompletion({
        ...terminal,
        operationId: journal.operationId,
        workspaceRoot: liveInput.workspaceRoot,
      });
      if (terminal.classification !== "SUCCEEDED") {
        throw new Error(
          `live human purchase command rejected with status ${terminal.statusCode}`,
        );
      }
      const proof = humanPurchaseSettlementProof(
        expectation,
        terminal.updateId,
      );
      const settlement = dependencies.authenticateProviderSettlement(
        await input.readTransaction(proof.updateId),
        proof,
        expectation,
      );
      await dependencies.markSettlementReconciled({
        operationId: journal.operationId,
        settlement,
        workspaceRoot: liveInput.workspaceRoot,
      });
      input.deferred.enable(expectation, proof);
      await assertOwned();
      const paidProof = paidHumanPurchaseProof(proof);
      const delivery = await readExactHumanPaidDelivery(
        await input.provider.retryPaid(paidProof),
        paidProof,
      );
      await dependencies.markDelivery({
        ...delivery,
        operationId: journal.operationId,
        workspaceRoot: liveInput.workspaceRoot,
      });
      return Object.freeze({
        completion: Object.freeze({
          completionOffset: terminal.completionOffset,
          updateId: terminal.updateId,
        }),
        delivery,
        operationId: journal.operationId,
        status: "paid-resource-delivered" as const,
      });
    },
  });
}
