import {
  loadCapabilityBootstrapJournalState,
  markCapabilityBootstrapFailed,
  markCapabilityBootstrapResolved,
  withCapabilityBootstrapLease,
} from "./capability-bootstrap-journal.js";
import { restoreCapabilityBootstrapJournalIntent } from "./capability-bootstrap-journal-intent.js";
import {
  DefinitiveCapabilityBootstrapRejectionError,
  recoverBoundedCapabilityBootstrap,
} from "./capability-bootstrap-runner.js";
import type { CapabilityBootstrapCompletion } from "./capability-bootstrap-completion.js";

type RecoveryInput = Readonly<{
  readActiveCapabilities: () => Promise<unknown>;
  readCompletion: (
    beginExclusive: number,
    request: ReturnType<typeof restoreCapabilityBootstrapJournalIntent>,
  ) => Promise<CapabilityBootstrapCompletion>;
  sourceCommit: string;
  workspaceRoot: string;
}>;

export class CapabilityWalletBootstrapNotExecutedError extends Error {
  constructor() {
    super("capability wallet execution was not started");
  }
}

function durableResult(
  state: Awaited<ReturnType<typeof loadCapabilityBootstrapJournalState>>,
) {
  if (state.resolution === null) return null;
  if (state.resolution.offset === null || state.resolution.updateId === null) {
    throw new Error("legacy capability wallet resolution is audit-only");
  }
  return state.resolution;
}

function requireRecoverable(
  state: Awaited<ReturnType<typeof loadCapabilityBootstrapJournalState>>,
  sourceCommit: string,
): void {
  if (state.intent.sourceCommit !== sourceCommit) {
    throw new Error("capability wallet recovery source commit does not match");
  }
  if (state.executionMode === "direct") {
    throw new Error("direct bootstrap journal cannot use wallet recovery");
  }
  if (!state.executionStarted || state.executionMode !== "wallet") {
    throw new CapabilityWalletBootstrapNotExecutedError();
  }
  if (state.completionCursor === null) {
    throw new Error("capability wallet completion cursor is missing");
  }
}

function throwDurableFailure(
  state: Awaited<ReturnType<typeof loadCapabilityBootstrapJournalState>>,
): void {
  if (state.failure !== null) {
    throw new DefinitiveCapabilityBootstrapRejectionError(
      state.failure.completionOffset,
      state.failure.statusCode,
    );
  }
}

export async function recoverCapabilityWalletBootstrap(input: RecoveryInput) {
  const initial = await loadCapabilityBootstrapJournalState(
    input.workspaceRoot,
  );
  requireRecoverable(initial, input.sourceCommit);
  throwDurableFailure(initial);
  const existing = durableResult(initial);
  if (existing !== null) return existing;
  return withCapabilityBootstrapLease({
    operationId: initial.operationId,
    workspaceRoot: input.workspaceRoot,
    action: async (assertOwned) => {
      const state = await loadCapabilityBootstrapJournalState(
        input.workspaceRoot,
      );
      requireRecoverable(state, input.sourceCommit);
      throwDurableFailure(state);
      const resolved = durableResult(state);
      if (resolved !== null) return resolved;
      let result;
      try {
        result = await recoverBoundedCapabilityBootstrap({
          beginExclusive: state.completionCursor!,
          intent: state.intent,
          readActiveCapabilities: input.readActiveCapabilities,
          readCompletion: input.readCompletion,
          restoreIntent: restoreCapabilityBootstrapJournalIntent,
        });
      } catch (error) {
        if (error instanceof DefinitiveCapabilityBootstrapRejectionError) {
          await assertOwned();
          const request = restoreCapabilityBootstrapJournalIntent(state.intent);
          await markCapabilityBootstrapFailed({
            commandId: request.commandId,
            completionOffset: error.completionOffset,
            operationId: state.operationId,
            statusCode: error.statusCode,
            workspaceRoot: input.workspaceRoot,
          });
        }
        throw error;
      }
      await assertOwned();
      await markCapabilityBootstrapResolved({
        ...result,
        operationId: state.operationId,
        workspaceRoot: input.workspaceRoot,
      });
      return result;
    },
  });
}
