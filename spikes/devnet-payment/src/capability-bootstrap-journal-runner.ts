import { isDeepStrictEqual } from "node:util";
import {
  exportBoundedCapabilityBootstrapIntent,
  type BoundedCapabilityBootstrapRequest,
} from "@sotto/x402-canton";
import {
  initializeCapabilityBootstrapJournal,
  loadCapabilityBootstrapJournalIntent,
  loadCapabilityBootstrapJournalState,
  markCapabilityBootstrapCompletionCursor,
  markCapabilityBootstrapFailed,
  markCapabilityBootstrapResolved,
  markCapabilityBootstrapSubmissionStarted,
  withCapabilityBootstrapLease,
} from "./capability-bootstrap-journal.js";
import {
  DefinitiveCapabilityBootstrapRejectionError,
  recoverBoundedCapabilityBootstrap,
  runBoundedCapabilityBootstrap,
} from "./capability-bootstrap-runner.js";
import type { CapabilityBootstrapCompletion } from "./capability-bootstrap-completion.js";
import { restoreCapabilityBootstrapJournalIntent } from "./capability-bootstrap-journal-intent.js";

type LiveBootstrapDependencies = Readonly<{
  readActiveCapabilities: () => Promise<unknown>;
  readCompletion: (
    beginExclusive: number,
    request: BoundedCapabilityBootstrapRequest,
  ) => Promise<CapabilityBootstrapCompletion>;
  workspaceRoot: string;
}>;

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

function currentDurableResolution(
  state: Awaited<ReturnType<typeof loadCapabilityBootstrapJournalState>>,
) {
  if (state.resolution === null) return null;
  if (state.resolution.offset === null || state.resolution.updateId === null) {
    throw new Error("legacy bootstrap resolution is audit-only");
  }
  return state.resolution;
}

async function initializeOrAdopt(input: {
  request: BoundedCapabilityBootstrapRequest;
  sourceCommit: string;
  workspaceRoot: string;
}) {
  try {
    return await initializeCapabilityBootstrapJournal(input);
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    const state = await loadCapabilityBootstrapJournalState(
      input.workspaceRoot,
    );
    const candidate = exportBoundedCapabilityBootstrapIntent(
      input.request,
      input.sourceCommit,
    );
    if (
      candidate.sourceCommit !== state.intent.sourceCommit ||
      !isDeepStrictEqual(candidate.request, state.intent.request)
    ) {
      throw new Error("existing bootstrap journal intent does not match", {
        cause: error,
      });
    }
    return Object.freeze({ operationId: state.operationId });
  }
}

async function recoverAndPersist(input: {
  assertOwned: () => Promise<void>;
  readActiveCapabilities: () => Promise<unknown>;
  readCompletion: LiveBootstrapDependencies["readCompletion"];
  state: Awaited<ReturnType<typeof loadCapabilityBootstrapJournalState>>;
  workspaceRoot: string;
}) {
  const durableResolution = currentDurableResolution(input.state);
  if (durableResolution !== null) return durableResolution;
  if (input.state.failure !== null) {
    throw new DefinitiveCapabilityBootstrapRejectionError(
      input.state.failure.completionOffset,
      input.state.failure.statusCode,
    );
  }
  if (input.state.completionCursor === null) {
    throw new Error("bootstrap completion cursor is missing");
  }
  let result;
  try {
    result = await recoverBoundedCapabilityBootstrap({
      beginExclusive: input.state.completionCursor,
      intent: input.state.intent,
      readActiveCapabilities: input.readActiveCapabilities,
      readCompletion: input.readCompletion,
      restoreIntent: restoreCapabilityBootstrapJournalIntent,
    });
  } catch (error) {
    if (error instanceof DefinitiveCapabilityBootstrapRejectionError) {
      await input.assertOwned();
      const request = restoreCapabilityBootstrapJournalIntent(
        input.state.intent,
      );
      await markCapabilityBootstrapFailed({
        commandId: request.commandId,
        completionOffset: error.completionOffset,
        operationId: input.state.operationId,
        statusCode: error.statusCode,
        workspaceRoot: input.workspaceRoot,
      });
    }
    throw error;
  }
  await input.assertOwned();
  await markCapabilityBootstrapResolved({
    ...result,
    operationId: input.state.operationId,
    workspaceRoot: input.workspaceRoot,
  });
  return result;
}

export async function startJournaledCapabilityBootstrap(
  input: LiveBootstrapDependencies &
    Readonly<{
      request: BoundedCapabilityBootstrapRequest;
      readLedgerEndOffset: () => Promise<number>;
      sourceCommit: string;
      submit: (request: BoundedCapabilityBootstrapRequest) => Promise<unknown>;
    }>,
) {
  const initialized = await initializeOrAdopt({
    request: input.request,
    sourceCommit: input.sourceCommit,
    workspaceRoot: input.workspaceRoot,
  });
  return withCapabilityBootstrapLease({
    operationId: initialized.operationId,
    workspaceRoot: input.workspaceRoot,
    action: async (assertOwned) => {
      const state = await loadCapabilityBootstrapJournalState(
        input.workspaceRoot,
      );
      if (state.operationId !== initialized.operationId) {
        throw new Error("bootstrap durable operation changed");
      }
      if (state.failure !== null) {
        throw new DefinitiveCapabilityBootstrapRejectionError(
          state.failure.completionOffset,
          state.failure.statusCode,
        );
      }
      if (state.submissionStarted) {
        return recoverAndPersist({
          assertOwned,
          readActiveCapabilities: input.readActiveCapabilities,
          readCompletion: input.readCompletion,
          state,
          workspaceRoot: input.workspaceRoot,
        });
      }
      const request = restoreCapabilityBootstrapJournalIntent(state.intent);
      let result;
      try {
        result = await runBoundedCapabilityBootstrap({
          persistCompletionCursor: async (beginExclusive) => {
            await assertOwned();
            await markCapabilityBootstrapCompletionCursor({
              beginExclusive,
              operationId: initialized.operationId,
              workspaceRoot: input.workspaceRoot,
            });
          },
          persistIntent: async (candidate) => {
            const loaded = await loadCapabilityBootstrapJournalIntent(
              input.workspaceRoot,
            );
            const persisted = restoreCapabilityBootstrapJournalIntent(
              loaded.intent,
            );
            if (
              loaded.operationId !== initialized.operationId ||
              !isDeepStrictEqual(persisted, candidate)
            ) {
              throw new Error(
                "bootstrap durable intent does not match request",
              );
            }
          },
          persistSubmissionStarted: async () => {
            await assertOwned();
            await markCapabilityBootstrapSubmissionStarted({
              operationId: initialized.operationId,
              workspaceRoot: input.workspaceRoot,
            });
          },
          readActiveCapabilities: input.readActiveCapabilities,
          readCompletion: input.readCompletion,
          readLedgerEndOffset: input.readLedgerEndOffset,
          request,
          submit: async (candidate) => {
            await assertOwned();
            return input.submit(candidate);
          },
        });
      } catch (error) {
        if (error instanceof DefinitiveCapabilityBootstrapRejectionError) {
          await assertOwned();
          await markCapabilityBootstrapFailed({
            commandId: request.commandId,
            completionOffset: error.completionOffset,
            operationId: initialized.operationId,
            statusCode: error.statusCode,
            workspaceRoot: input.workspaceRoot,
          });
        }
        throw error;
      }
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

export async function recoverJournaledCapabilityBootstrap(
  input: LiveBootstrapDependencies & Readonly<{ sourceCommit: string }>,
) {
  const state = await loadCapabilityBootstrapJournalState(input.workspaceRoot);
  const durableResolution = currentDurableResolution(state);
  if (durableResolution !== null) return durableResolution;
  if (state.failure !== null) {
    throw new DefinitiveCapabilityBootstrapRejectionError(
      state.failure.completionOffset,
      state.failure.statusCode,
    );
  }
  if (!state.submissionStarted) {
    throw new Error(
      "bootstrap submission was not started; recovery cannot submit",
    );
  }
  if (state.intent.sourceCommit !== input.sourceCommit) {
    throw new Error("bootstrap recovery source commit does not match");
  }
  return withCapabilityBootstrapLease({
    operationId: state.operationId,
    workspaceRoot: input.workspaceRoot,
    action: async (assertOwned) => {
      await assertOwned();
      const current = await loadCapabilityBootstrapJournalState(
        input.workspaceRoot,
      );
      if (current.operationId !== state.operationId) {
        throw new Error("bootstrap durable operation changed");
      }
      if (
        current.resolution === null &&
        current.intent.sourceCommit !== input.sourceCommit
      ) {
        throw new Error("bootstrap recovery source commit changed");
      }
      return recoverAndPersist({
        assertOwned,
        readActiveCapabilities: input.readActiveCapabilities,
        readCompletion: input.readCompletion,
        state: current,
        workspaceRoot: input.workspaceRoot,
      });
    },
  });
}
