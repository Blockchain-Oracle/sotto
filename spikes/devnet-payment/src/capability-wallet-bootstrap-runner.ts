import {
  assertBoundedCapabilityBootstrapFresh,
  createCapabilityWalletSigningSession,
  createPreparedCapabilityBootstrapObserver,
  projectPreparedCapabilityBootstrapApproval,
  reconcileBoundedCapabilityBootstrapAcs,
  verifyCapabilityWalletSignature,
  verifyPreparedCapabilityBootstrapHash,
} from "@sotto/x402-canton";
import {
  initializeCapabilityBootstrapJournal,
  loadCapabilityBootstrapJournalState,
  markCapabilityBootstrapApprovalRequested,
  markCapabilityBootstrapCompletionCursor,
  markCapabilityBootstrapExecutionStarted,
  markCapabilityBootstrapPreparedVerified,
  markCapabilityBootstrapResolved,
  markCapabilityBootstrapSignatureReceived,
  withCapabilityBootstrapLease,
} from "./capability-bootstrap-journal.js";
import { restoreCapabilityBootstrapJournalIntent } from "./capability-bootstrap-journal-intent.js";
import { recoverBoundedCapabilityBootstrap } from "./capability-bootstrap-runner.js";
import {
  CapabilityWalletBootstrapApprovalError,
  capabilityWalletSignatureSha256,
  requireCapabilityWalletExecutionResult,
  type CapabilityWalletBootstrapRunnerInput,
  type CapabilityWalletExecutionStarted,
} from "./capability-wallet-bootstrap-runner-support.js";

export { CapabilityWalletBootstrapApprovalError };
export type { CapabilityWalletBootstrapRunnerInput };

export async function startCapabilityWalletBootstrap(
  input: CapabilityWalletBootstrapRunnerInput,
) {
  const initialized = await initializeCapabilityBootstrapJournal({
    request: input.request,
    sourceCommit: input.sourceCommit,
    workspaceRoot: input.workspaceRoot,
  });
  return withCapabilityBootstrapLease({
    operationId: initialized.operationId,
    workspaceRoot: input.workspaceRoot,
    action: async (assertOwned) => {
      assertBoundedCapabilityBootstrapFresh(input.request);
      const before = reconcileBoundedCapabilityBootstrapAcs(
        await input.readActiveCapabilities(),
        input.request,
      );
      if (before.activeCount !== 0) {
        throw new Error("capability wallet bootstrap preflight must be empty");
      }
      const beginExclusive = await input.readLedgerEndOffset();
      if (!Number.isSafeInteger(beginExclusive) || beginExclusive < 0) {
        throw new Error("capability wallet completion cursor is invalid");
      }
      await assertOwned();
      await markCapabilityBootstrapCompletionCursor({
        beginExclusive,
        operationId: initialized.operationId,
        workspaceRoot: input.workspaceRoot,
      });
      const observed = await createPreparedCapabilityBootstrapObserver(
        input.prepare,
      )(input.request);
      const prepared = await verifyPreparedCapabilityBootstrapHash(observed, {
        recomputeOfficialHash: input.recomputeOfficialHash,
      });
      const approval = projectPreparedCapabilityBootstrapApproval(prepared);
      await assertOwned();
      await markCapabilityBootstrapPreparedVerified({
        operationId: initialized.operationId,
        preparedTransactionHash: approval.preparedTransactionHash,
        workspaceRoot: input.workspaceRoot,
      });
      const session = await createCapabilityWalletSigningSession({
        connector: input.connector,
        connectorId: input.connectorId,
        connectorOrigin: input.connectorOrigin,
        onApprovalRequested: async (started) => {
          await assertOwned();
          await markCapabilityBootstrapApprovalRequested({
            ...started,
            operationId: initialized.operationId,
            workspaceRoot: input.workspaceRoot,
          });
        },
        prepared,
        signal: input.signal,
        timeoutMilliseconds: input.timeoutMilliseconds,
      });
      if (session.outcome === "unsupported") {
        throw new CapabilityWalletBootstrapApprovalError(
          session.outcome,
          session.reason,
        );
      }
      if (session.outcome === "rejected") {
        throw new CapabilityWalletBootstrapApprovalError(
          session.outcome,
          session.reason,
        );
      }
      const verified = await verifyCapabilityWalletSignature(session, {
        resolveRegisteredPublicKey: input.resolveRegisteredPublicKey,
      });
      await assertOwned();
      await markCapabilityBootstrapSignatureReceived({
        operationId: initialized.operationId,
        sessionId: verified.sessionId,
        signatureFormat: verified.signatureFormat,
        signatureSha256: capabilityWalletSignatureSha256(
          session.signature.signature,
        ),
        signedBy: verified.signedBy,
        signingAlgorithm: verified.signingAlgorithm,
        workspaceRoot: input.workspaceRoot,
      });
      let executionStarted: CapabilityWalletExecutionStarted | null = null;
      const execution = await input.execute(verified, async (value) => {
        if (executionStarted !== null) {
          throw new Error("capability wallet execution start was repeated");
        }
        executionStarted = Object.freeze({ ...value });
        await assertOwned();
        await markCapabilityBootstrapExecutionStarted({
          ...value,
          operationId: initialized.operationId,
          workspaceRoot: input.workspaceRoot,
        });
      });
      requireCapabilityWalletExecutionResult(execution, executionStarted, {
        preparedTransactionHash: approval.preparedTransactionHash,
        sessionId: session.sessionId,
        userId: input.request.userId,
      });
      const state = await loadCapabilityBootstrapJournalState(
        input.workspaceRoot,
      );
      const reconciled = await recoverBoundedCapabilityBootstrap({
        beginExclusive,
        intent: state.intent,
        readActiveCapabilities: input.readActiveCapabilities,
        readCompletion: input.readCompletion,
        restoreIntent: restoreCapabilityBootstrapJournalIntent,
      });
      const result = Object.freeze({
        ...reconciled,
        outcome: "submitted" as const,
      });
      await assertOwned();
      await markCapabilityBootstrapResolved({
        ...result,
        operationId: initialized.operationId,
        workspaceRoot: input.workspaceRoot,
      });
      return result;
    },
  });
}
